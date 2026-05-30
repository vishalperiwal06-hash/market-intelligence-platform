/**
 * Rankings API
 * 
 * GET /api/rankings?type=strongest_stocks
 */
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const VALID_TYPES = ['strongest_stocks', 'volume_expansion', 'momentum_leaders'];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }

  try {
    const cached = await redis.get(`ranking:${type}`);
    if (cached) {
      return NextResponse.json({
        type,
        source: 'cache',
        data: JSON.parse(cached),
      });
    }

    return NextResponse.json({
      type,
      source: 'none',
      data: [],
      message: 'Rankings not yet computed',
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to retrieve rankings', details: error.message },
      { status: 500 }
    );
  }
}
