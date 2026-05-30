/**
 * Chart Data API
 *
 * GET /api/chart?symbol=RELIANCE&timeframe=1d&limit=100
 *
 * Returns genuine OHLC candles from the database.
 * If no candle history exists for a symbol, returns an empty array.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ohlcCandles } from '@/lib/db/schema';
import { redis } from '@/lib/redis';
import { eq, and, desc, gte } from 'drizzle-orm';

const VALID_TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d'];
const MAX_LIMIT = 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const timeframe = searchParams.get('timeframe') || '1d';
  const limitParam = parseInt(searchParams.get('limit') || '200', 10);
  const from = searchParams.get('from'); // ISO timestamp

  if (!symbol) {
    return NextResponse.json({ error: 'symbol parameter is required' }, { status: 400 });
  }

  if (!VALID_TIMEFRAMES.includes(timeframe)) {
    return NextResponse.json(
      { error: `Invalid timeframe. Valid: ${VALID_TIMEFRAMES.join(', ')}` },
      { status: 400 },
    );
  }

  const limit = Math.min(Math.max(limitParam, 1), MAX_LIMIT);

  try {
    // Try Redis cache first for recent candles (only if 'from' is not specified)
    if (!from) {
      const cacheKey = `candles:${timeframe}:${symbol}`;
      const cachedCandles = await redis.zrange(cacheKey, -limit, -1);

      if (cachedCandles && cachedCandles.length > 0) {
        const candles = cachedCandles.map(c => JSON.parse(c));
        return NextResponse.json({
          symbol,
          timeframe,
          count: candles.length,
          source: 'cache',
          candles,
        });
      }
    }
    // Fall back to Postgres
    const conditions = [
      eq(ohlcCandles.symbol, symbol),
      eq(ohlcCandles.timeframe, timeframe),
    ];

    if (from) {
      conditions.push(gte(ohlcCandles.bucketStart, new Date(from)));
    }

    const rows = await db
      .select({
        o: ohlcCandles.open,
        h: ohlcCandles.high,
        l: ohlcCandles.low,
        c: ohlcCandles.close,
        v: ohlcCandles.volume,
        turnover: ohlcCandles.turnover,
        t: ohlcCandles.bucketStart,
      })
      .from(ohlcCandles)
      .where(and(...conditions))
      .orderBy(desc(ohlcCandles.bucketStart))
      .limit(limit);

    // Reverse to chronological order
    const candles = rows.reverse().map(r => ({
      o: r.o,
      h: r.h,
      l: r.l,
      c: r.c,
      v: Number(r.v ?? 0),
      turnover: r.turnover,
      t: r.t.toISOString(),
    }));

    return NextResponse.json({
      symbol,
      timeframe,
      count: candles.length,
      source: 'database',
      candles,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to retrieve chart data', details: error.message },
      { status: 500 },
    );
  }
}
