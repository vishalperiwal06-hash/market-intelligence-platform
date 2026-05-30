/**
 * Rate Limit Engine
 * 
 * Enforces provider-specific request limits. Uses a simple token bucket / time-window approach
 * combined with Redis for distributed environments.
 */
import { redis } from '../../../lib/redis';
import { logger } from '../../../lib/logger';

export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  batchSizeLimit: number;
}

export class RateLimitEngine {
  private configs = new Map<string, RateLimitConfig>();

  setConfig(providerName: string, config: RateLimitConfig) {
    this.configs.set(providerName, config);
  }

  /**
   * Checks if a request is allowed to proceed.
   * Throws if rate limit is exceeded.
   */
  async acquire(providerName: string, requestWeight: number = 1): Promise<void> {
    const config = this.configs.get(providerName);
    if (!config) return; // No limit configured

    const now = Math.floor(Date.now() / 1000); // Current second
    const minute = Math.floor(now / 60); // Current minute

    const secKey = `rate:${providerName}:sec:${now}`;
    const minKey = `rate:${providerName}:min:${minute}`;

    const pipe = redis.pipeline();
    pipe.incrby(secKey, requestWeight);
    pipe.expire(secKey, 5); // Clean up quickly
    pipe.incrby(minKey, requestWeight);
    pipe.expire(minKey, 120);

    const results = await pipe.exec();
    if (!results) throw new Error('Redis pipeline failed');

    const secCount = results[0][1] as number;
    const minCount = results[2][1] as number;

    if (secCount > config.requestsPerSecond) {
      logger.warn('RateLimiter', `${providerName} hit per-second limit (${secCount}/${config.requestsPerSecond})`);
      throw new Error(`Rate limit exceeded for ${providerName} (per second)`);
    }

    if (minCount > config.requestsPerMinute) {
      logger.warn('RateLimiter', `${providerName} hit per-minute limit (${minCount}/${config.requestsPerMinute})`);
      throw new Error(`Rate limit exceeded for ${providerName} (per minute)`);
    }
  }

  /**
   * Chunks a list of symbols into allowed batch sizes for the provider.
   */
  getBatches<T>(providerName: string, items: T[]): T[][] {
    const config = this.configs.get(providerName);
    const size = config?.batchSizeLimit || 50;
    
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }
}

export const rateLimitEngine = new RateLimitEngine();
