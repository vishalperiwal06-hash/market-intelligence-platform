import { Redis } from 'ioredis';
import { logger } from './logger';
import { getRedisUrl } from './runtime-env';

const globalForRedis = global as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(getRedisUrl(), {
    lazyConnect: process.env.NEXT_PHASE === 'phase-production-build',
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 10) {
        logger.error('Redis', 'Capped Redis reconnect attempts reached. Stopping reconnect efforts.');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });

redis.on('error', (error) => {
  logger.warn('Redis', 'Redis connection error', { error: error.message });
});

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

/**
 * Acquire a distributed lock in Redis using the NX (Only insert if not exists) 
 * and PX (expiration time in milliseconds) options, storing the unique owner token.
 */
export async function acquireLock(key: string, ownerToken: string, ttlMs: number): Promise<boolean> {
  try {
    const result = await (redis.set as any)(key, ownerToken, 'PX', ttlMs, 'NX');
    return result === 'OK';
  } catch (err) {
    logger.error('Redis', `Failed to acquire lock for key ${key} with owner ${ownerToken}`, err);
    return false;
  }
}

/**
 * Release a distributed lock by deleting the key only if the owner matches.
 * Uses a Lua compare-and-delete pattern to avoid deleting another worker's lock.
 */
export async function releaseLock(key: string, ownerToken: string): Promise<boolean> {
  try {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redis.eval(script, 1, key, ownerToken);
    return result === 1;
  } catch (err) {
    logger.error('Redis', `Failed to release lock for key ${key} with owner ${ownerToken}`, err);
    return false;
  }
}

