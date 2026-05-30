/**
 * Data Quality Engine
 * 
 * Filters out bad, stale, duplicated, or anomalous ticks before they hit the pipeline.
 * Ensures the 'No Fabricated Data' rule is strictly enforced.
 */
import { NormalizedMarketData } from '../adapters/base';
import { logger } from '../../../lib/logger';
import { redis } from '../../../lib/redis';

export class DataQualityEngine {
  private readonly MAX_STALE_MS = 60_000 * 15; // 15 minutes (delay allowed for free providers)
  private readonly MAX_PRICE_JUMP_PERCENT = 0.20; // 20% jump is suspicious (usually circuit limit)

  async validateQuotes(providerName: string, quotes: NormalizedMarketData[]): Promise<NormalizedMarketData[]> {
    const valid: NormalizedMarketData[] = [];
    const now = Date.now();

    for (const quote of quotes) {
      try {
        // 1. Missing Core Fields
        if (!quote.symbol || quote.price == null || isNaN(quote.price)) {
          logger.warn('QualityEngine', `[${providerName}] Dropped tick missing symbol/price: ${JSON.stringify(quote)}`);
          continue;
        }

        // 2. Timestamp Validation (Staleness)
        const tickTime = new Date(quote.timestamp).getTime();
        if (now - tickTime > this.MAX_STALE_MS) {
          logger.debug('QualityEngine', `[${providerName}] Dropped stale tick for ${quote.symbol} (${Math.round((now-tickTime)/60000)}m old)`);
          continue;
        }

        // 3. Deduplication (don't process if price and volume haven't changed)
        const lastTickStr = await redis.hget(`market:tick:${quote.symbol}`, 'last_raw');
        if (lastTickStr) {
          const lastTick = JSON.parse(lastTickStr);
          if (lastTick.price === quote.price && lastTick.volume === quote.volume) {
             // Duplicate, harmless but skip to save processing
             continue;
          }
          
          // 4. Anomaly Detection (Extreme price jumps)
          if (lastTick.price > 0) {
            const jumpPercent = Math.abs(quote.price - lastTick.price) / lastTick.price;
            if (jumpPercent > this.MAX_PRICE_JUMP_PERCENT) {
              logger.warn('QualityEngine', `[${providerName}] Dropped anomalous jump for ${quote.symbol}: ${lastTick.price} -> ${quote.price}`);
              continue;
            }
          }
        }

        // Save raw for next deduplication check
        await redis.hset(`market:tick:${quote.symbol}`, 'last_raw', JSON.stringify({
          price: quote.price,
          volume: quote.volume,
          timestamp: quote.timestamp
        }));

        valid.push(quote);
      } catch (err) {
        logger.error('QualityEngine', `Validation error for ${quote.symbol}`, err);
      }
    }

    return valid;
  }
}

export const dataQualityEngine = new DataQualityEngine();
