/**
 * Rate Limiter — Redis-backed per-user request throttling
 * Phase 16 — Production Security
 */
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'api:general':    { windowMs: 60_000, maxRequests: 60 },      // 60 req/min
  'api:copilot':    { windowMs: 60_000, maxRequests: 10 },      // 10 AI queries/min
  'api:auth':       { windowMs: 300_000, maxRequests: 10 },     // 10 login attempts / 5min
  'api:upload':     { windowMs: 60_000, maxRequests: 5 },       // 5 uploads/min
};

export class RateLimiter {
  /**
   * Check whether a given identifier (userId or IP) is rate-limited.
   * Returns { allowed, remaining, retryAfterMs }.
   */
  async check(
    identifier: string,
    bucket: string = 'api:general'
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const config = RATE_LIMITS[bucket] || RATE_LIMITS['api:general'];
    const key = `ratelimit:${bucket}:${identifier}`;
    const windowSec = Math.ceil(config.windowMs / 1000);

    try {
      const current = await redis.incr(key);

      // Set expiry only on first request in window
      if (current === 1) {
        await redis.expire(key, windowSec);
      }

      const remaining = Math.max(0, config.maxRequests - current);
      const allowed = current <= config.maxRequests;

      if (!allowed) {
        const ttl = await redis.ttl(key);
        logger.warn('RateLimiter', `Rate limit hit for ${identifier} on ${bucket}`);
        return { allowed: false, remaining: 0, retryAfterMs: ttl * 1000 };
      }

      return { allowed: true, remaining, retryAfterMs: 0 };
    } catch (error) {
      // If Redis is down, fail-open to avoid blocking all traffic
      logger.error('RateLimiter', 'Redis check failed, allowing request', error);
      return { allowed: true, remaining: -1, retryAfterMs: 0 };
    }
  }
}

export const rateLimiter = new RateLimiter();
