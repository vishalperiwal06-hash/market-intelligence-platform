/**
 * System Diagnostics API
 *
 * GET /api/diagnostics
 *
 * Returns health and status of all backend systems.
 */
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    systems: {},
  };

  // Redis health
  try {
    const pong = await redis.ping();
    const keyCount = await redis.dbsize();
    diagnostics.systems.redis = {
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      keys: keyCount,
    };
  } catch {
    diagnostics.systems.redis = { status: 'unhealthy' };
  }

  // Market data freshness
  try {
    const sampleKeys = await redis.keys('market:tick:*');
    const activeSymbols = sampleKeys.length;

    let freshCount = 0;
    const now = Date.now();
    for (const key of sampleKeys.slice(0, 10)) {
      const tick = await redis.hget(key, 'timestamp');
      if (tick && now - new Date(tick).getTime() < 30_000) {
        freshCount++;
      }
    }

    diagnostics.systems.marketData = {
      status: activeSymbols > 0 ? 'active' : 'empty',
      activeSymbols,
      sampleFreshness: `${freshCount}/10 symbols updated within 30s`,
    };
  } catch {
    diagnostics.systems.marketData = { status: 'unknown' };
  }

  // Indicator freshness
  try {
    const indicatorKeys = await redis.keys('indicator:*');
    diagnostics.systems.indicators = {
      status: indicatorKeys.length > 0 ? 'active' : 'awaiting_data',
      cachedCount: indicatorKeys.length,
    };
  } catch {
    diagnostics.systems.indicators = { status: 'unknown' };
  }

  // Candle data
  try {
    const candleKeys = await redis.keys('candle:*');
    diagnostics.systems.candles = {
      status: candleKeys.length > 0 ? 'active' : 'awaiting_data',
      cachedTimeframes: candleKeys.length,
    };
  } catch {
    diagnostics.systems.candles = { status: 'unknown' };
  }

  // Breadth
  try {
    const breadth = await redis.get('market:breadth');
    diagnostics.systems.breadth = {
      status: breadth ? 'active' : 'awaiting_data',
      latest: breadth ? JSON.parse(breadth) : null,
    };
  } catch {
    diagnostics.systems.breadth = { status: 'unknown' };
  }

  return NextResponse.json(diagnostics);
}
