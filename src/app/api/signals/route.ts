/**
 * Active Signals API
 * 
 * GET /api/signals?limit=50&type=momentum
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { activeSignals } from '@/lib/db/schema';
import { desc, gt, and, eq } from 'drizzle-orm';
import { redis } from '@/lib/redis';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = parseInt(searchParams.get('limit') || '50', 10);
  const typeParam = searchParams.get('type');
  const symbolParam = searchParams.get('symbol')?.toUpperCase();
  const limit = Math.min(limitParam, 200);

  try {
    const cacheKey = `api:signals:${limitParam}:${typeParam || 'all'}:${symbolParam || 'all'}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return new NextResponse(cached, { headers: { 'Content-Type': 'application/json' } });
    }

    const conditions = [gt(activeSignals.expiresAt, new Date())]; // Only non-expired
    
    if (typeParam) conditions.push(eq(activeSignals.signalType, typeParam));
    if (symbolParam) conditions.push(eq(activeSignals.symbol, symbolParam));

    const rows = await db
      .select()
      .from(activeSignals)
      .where(and(...conditions))
      .orderBy(desc(activeSignals.timestamp))
      .limit(limit);

    const responseObj = {
      count: rows.length,
      signals: rows,
    };

    const responseBody = JSON.stringify(responseObj);
    await redis.set(cacheKey, responseBody, 'EX', 10); // Cache for 10s (protects DB from 15s polling storms)

    return new NextResponse(responseBody, { headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to retrieve signals', details: error.message },
      { status: 500 }
    );
  }
}
