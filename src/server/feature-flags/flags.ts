import { redis } from '../../lib/redis';
import { db } from '../../lib/db';
import { featureFlags } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger';

export class FeatureFlagEngine {
  /**
   * Checks if a feature flag is enabled.
   * Checks Redis cache first, falls back to DB.
   */
  async isEnabled(flagKey: string): Promise<boolean> {
    try {
      // 1. Check Redis Cache
      const cached = await redis.get(`flag:${flagKey}`);
      if (cached !== null) {
        return cached === '1';
      }

      // 2. Fallback to DB
      const result = await db.select().from(featureFlags).where(eq(featureFlags.flagKey, flagKey));
      
      const isEnabled = result.length > 0 ? result[0].isEnabled : false;
      
      // 3. Cache the result for 5 minutes
      await redis.set(`flag:${flagKey}`, isEnabled ? '1' : '0', 'EX', 300);

      return isEnabled;
    } catch (error) {
      logger.error('FeatureFlagEngine', `Failed to check flag ${flagKey}`, error);
      // Fail-closed for safety
      return false;
    }
  }

  /**
   * Toggles a feature flag globally.
   */
  async toggleFlag(flagKey: string, isEnabled: boolean): Promise<void> {
    try {
      // Upsert in DB
      const existing = await db.select().from(featureFlags).where(eq(featureFlags.flagKey, flagKey));
      if (existing.length > 0) {
        await db.update(featureFlags).set({ isEnabled, updatedAt: new Date() }).where(eq(featureFlags.flagKey, flagKey));
      } else {
        await db.insert(featureFlags).values({ flagKey, isEnabled });
      }

      // Update Redis cache immediately
      await redis.set(`flag:${flagKey}`, isEnabled ? '1' : '0', 'EX', 300);
      
      logger.info('FeatureFlagEngine', `Flag ${flagKey} set to ${isEnabled}`);
    } catch (error) {
      logger.error('FeatureFlagEngine', `Failed to toggle flag ${flagKey}`, error);
      throw error;
    }
  }
}

export const flags = new FeatureFlagEngine();
