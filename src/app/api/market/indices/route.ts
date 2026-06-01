import { NextResponse } from 'next/server';
import { nseDataService } from '@/server/nse/nselib-service';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let indices: any[] = [];
    let source = 'unknown';

    // Strategy 1: Try NSE data service
    try {
      const nseIndices = await nseDataService.indices();
      if (nseIndices && nseIndices.length > 0) {
        indices = nseIndices;
        source = 'nse-data-service';
      }
    } catch {
      // NSE data service unavailable
    }

    // Strategy 2: Read from Redis cache (populated by pipeline)
    if (indices.length === 0) {
      try {
        const indexKeys = ['NIFTY50', 'NIFTY 50', 'NIFTY BANK', 'SENSEX', '^NSEI', '^NSEBANK', '^BSESN'];
        const pipe = redis.pipeline();
        for (const key of indexKeys) {
          pipe.hgetall(`market:index:${key}`);
        }
        const results = await pipe.exec();
        if (results) {
          for (const [err, data] of results as [Error | null, Record<string, string>][]) {
            if (!err && data && data.price && parseFloat(data.price) > 0) {
              indices.push({
                symbol: data.symbol || 'UNKNOWN',
                price: parseFloat(data.price),
                change: parseFloat(data.change || '0'),
                changePercent: parseFloat(data.changePercent || '0'),
                timestamp: data.timestamp || new Date().toISOString(),
                source: 'pipeline-cache',
              });
            }
          }
        }
        if (indices.length > 0) source = 'redis-cache';
      } catch {
        // Redis unavailable
      }
    }

    // Filter for key indices
    const targets = ['NIFTY 50', 'NIFTY 55', 'NIFTY BANK', 'SENSEX', 'Nifty 50', 'Nifty Bank', 'NIFTY50', '^NSEI', '^NSEBANK', '^BSESN'];
    const filtered = indices.filter(idx =>
      targets.some(t => (idx.symbol || '').toUpperCase().includes(t.toUpperCase()))
    );

    return NextResponse.json({
      ok: true,
      data: filtered.length > 0 ? filtered : indices,
      meta: {
        count: filtered.length || indices.length,
        source,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'INDICES_FETCH_FAILED',
          message: 'Failed to retrieve index quotes',
          details: error.message,
        },
      },
      { status: 500 }
    );
  }
}
