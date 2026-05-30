/**
 * Data Provider Diagnostics API
 * 
 * GET /api/providers
 * 
 * Returns the health, rate limit stats, and circuit breaker status 
 * for all orchestrated data sources.
 */
import { NextResponse } from 'next/server';
import { providerHealthEngine } from '@/server/market-engine/orchestration/health';
import { redis } from '@/lib/redis';

export async function GET() {
  const cacheKey = 'api:providers:status';
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return new NextResponse(cached, { headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    // ignore
  }

  const stats = providerHealthEngine.getAllStats();
  
  // Also fetch any rate limit metrics from Redis if available
  const providers = Object.keys(stats);
  const detailedStats: Record<string, any> = {};

  const now = Math.floor(Date.now() / 1000);
  const minute = Math.floor(now / 60);

  for (const provider of providers) {
    const secKey = `rate:${provider}:sec:${now}`;
    const minKey = `rate:${provider}:min:${minute}`;

    try {
      const [secLoad, minLoad] = await Promise.all([
        redis.get(secKey),
        redis.get(minKey)
      ]);

      detailedStats[provider] = {
        ...stats[provider],
        currentLoad: {
          reqPerSec: parseInt(secLoad || '0', 10),
          reqPerMin: parseInt(minLoad || '0', 10),
        }
      };
    } catch {
      detailedStats[provider] = { ...stats[provider], currentLoad: 'unknown' };
    }
  }

  const responseObj = {
    timestamp: new Date().toISOString(),
    providers: detailedStats,
  };

  const responseBody = JSON.stringify(responseObj);
  try {
    await redis.set(cacheKey, responseBody, 'EX', 4);
  } catch (e) {
    // ignore
  }

  return new NextResponse(responseBody, { headers: { 'Content-Type': 'application/json' } });
}
