/**
 * Sector Rotation History API
 *
 * GET /api/sectors?limit=50
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sectorHistory } from '@/lib/db/schema';
import { redis } from '@/lib/redis';
import { desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  try {
    // Try Redis hot cache first
    const cached = await redis.get('market:sector_rotation');
    if (cached) {
      return NextResponse.json({
        source: 'cache',
        data: JSON.parse(cached),
      });
    }

    // Fall back to Postgres
    const rows = await db
      .select()
      .from(sectorHistory)
      .orderBy(desc(sectorHistory.timestamp))
      .limit(limit);

    const responseData = {
      source: 'database',
      count: rows.length,
      data: rows,
    };

    // Populate the cache for 20s
    try {
      await redis.set('market:sector_rotation', JSON.stringify(rows), 'EX', 20);
    } catch(e) {}

    return NextResponse.json(responseData);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to retrieve sector data', details: error.message },
      { status: 500 },
    );
  }
}
