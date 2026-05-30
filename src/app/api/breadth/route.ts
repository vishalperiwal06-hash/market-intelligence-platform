/**
 * Market Breadth History API
 *
 * GET /api/breadth?limit=100
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { breadthHistory } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

  try {
    const rows = await db
      .select()
      .from(breadthHistory)
      .orderBy(desc(breadthHistory.timestamp))
      .limit(limit);

    return NextResponse.json({
      count: rows.length,
      data: rows.reverse(), // Chronological
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to retrieve breadth history', details: error.message },
      { status: 500 },
    );
  }
}
