/**
 * Market Leadership Engine (Ranking)
 * 
 * Aggregates live data and technical indicators to rank:
 * - Strongest Stocks
 * - Momentum Leaders
 * - Highest Volume Expansion
 */
import { db } from '../../../lib/db';
import { sql } from 'drizzle-orm';
import { redis } from '../../../lib/redis';
import { rankingSnapshots } from '../../../lib/db/schema';
import { logger } from '../../../lib/logger';

export class RankingEngine {
  
  async computeRankings() {
    try {
      // 1. Strongest Stocks (Best Price Change % today)
      // Read from Redis sorted sets maintained by MarketPipeline
      const gainers = await redis.zrevrange('market:gainers', 0, 19, 'WITHSCORES'); // Top 20
      const formattedGainers = [];
      for (let i = 0; i < gainers.length; i += 2) {
        formattedGainers.push({ symbol: gainers[i], changePercent: parseFloat(gainers[i+1]) });
      }

      await this.persistSnapshot('strongest_stocks', formattedGainers);

      // 2. Highest Volume Expansion (Current Volume / SMA20 Volume)
      // We do a fast Postgres query against the latest indicators
      const volResults = await db.execute(sql`
        SELECT i.symbol, o.volume, i.volume_sma20, (o.volume / NULLIF(i.volume_sma20, 0)) as expansion_ratio
        FROM technical_indicators i
        JOIN ohlc_candles o ON i.symbol = o.symbol AND i.timeframe = o.timeframe AND i.timestamp = o.bucket_start
        WHERE i.timeframe = '1d' AND i.timestamp = (SELECT COALESCE(MAX(timestamp), CURRENT_DATE) FROM technical_indicators WHERE timeframe = '1d')
        ORDER BY expansion_ratio DESC NULLS LAST
        LIMIT 20
      `);

      const volExpansion = (volResults as any[]).map(r => ({
        symbol: r.symbol,
        volume: Number(r.volume),
        volumeSma20: r.volume_sma20,
        ratio: r.expansion_ratio,
      }));

      await this.persistSnapshot('volume_expansion', volExpansion);

      // 3. Momentum Leaders (Highest RSI > 60 + MACD > 0 + Trend Alignment)
      const momResults = await db.execute(sql`
        SELECT symbol, rsi14, macd_histogram, ema50
        FROM technical_indicators
        WHERE timeframe = '1d' 
          AND timestamp = (SELECT COALESCE(MAX(timestamp), CURRENT_DATE) FROM technical_indicators WHERE timeframe = '1d')
          AND rsi14 > 60 
          AND macd_histogram > 0
        ORDER BY rsi14 DESC
        LIMIT 20
      `);

      const momentumLeaders = (momResults as any[]).map(r => ({
        symbol: r.symbol,
        rsi14: r.rsi14,
        macdHistogram: r.macd_histogram,
      }));

      await this.persistSnapshot('momentum_leaders', momentumLeaders);

      logger.info('RankingEngine', 'Computed market rankings');

    } catch (err) {
      logger.error('RankingEngine', 'Failed to compute rankings', err);
    }
  }

  private async persistSnapshot(type: string, data: any) {
    const now = new Date();
    
    // Store in Redis hot cache
    await redis.set(`ranking:${type}`, JSON.stringify(data), 'EX', 300);

    // Persist to Postgres history
    await db.insert(rankingSnapshots).values({
      rankingType: type,
      data,
      timestamp: now,
    });
  }
}

export const rankingEngine = new RankingEngine();
