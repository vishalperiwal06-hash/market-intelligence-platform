/**
 * OHLC Candle Aggregation Engine
 *
 * Generates 1m, 5m, 15m, 1h, and 1d candles from genuine tick history ONLY.
 * Never fabricates candle data — if no ticks exist for a bucket, no candle is created.
 */
import { db } from '../../../lib/db';
import { ohlcCandles } from '../../../lib/db/schema';
import { redis, acquireLock, releaseLock } from '../../../lib/redis';
import { logger } from '../../../lib/logger';
import { sql, and, gte, lt, eq } from 'drizzle-orm';
import { metricsCollector } from '../../../lib/metrics-collector';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d';

interface CandleResult {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  tickCount: number;
}

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m':  60_000,
  '5m':  300_000,
  '15m': 900_000,
  '1h':  3_600_000,
  '1d':  86_400_000,
};

export class OHLCEngine {
  private isRunning = false;

  /**
   * Get the bucket start timestamp for a given time and timeframe
   */
  getBucketStart(time: Date, tf: Timeframe): Date {
    const ms = time.getTime();
    const interval = TIMEFRAME_MS[tf];
    const bucketMs = Math.floor(ms / interval) * interval;
    return new Date(bucketMs);
  }

  /**
   * Aggregate ticks within a time range into OHLC candles.
   * This is the core aggregation query — it runs against genuine tick_history rows only.
   */
  async aggregateBucket(tf: Timeframe, bucketStart: Date): Promise<void> {
    const lockKey = `lock:ohlc:${tf}:${bucketStart.getTime()}`;
    const ownerToken = `ohlc:${tf}:${bucketStart.getTime()}:${Math.random().toString(36).substring(2, 11)}`;
    const acquired = await acquireLock(lockKey, ownerToken, 30000);
    if (!acquired) {
      logger.debug('OHLCEngine', `Skipping aggregation for ${tf} bucket ${bucketStart.toISOString()} — another worker has the lock`);
      return;
    }

    const bucketEnd = new Date(bucketStart.getTime() + TIMEFRAME_MS[tf]);
    const startTime = Date.now();

    try {
      // Raw SQL aggregation for performance — groups ticks by symbol within the bucket.
      // The FIRST_VALUE / LAST_VALUE approach ensures open/close are the actual first/last prices.
      const result = await db.execute(sql`
        WITH ordered_ticks AS (
          SELECT
            symbol,
            price,
            volume,
            turnover,
            timestamp,
            ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY timestamp ASC) as rn_asc,
            ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn_desc
          FROM tick_history
          WHERE timestamp >= ${bucketStart.toISOString()}::timestamptz
            AND timestamp < ${bucketEnd.toISOString()}::timestamptz
        )
        SELECT
          symbol,
          MAX(CASE WHEN rn_asc = 1 THEN price END) as open,
          MAX(price) as high,
          MIN(price) as low,
          MAX(CASE WHEN rn_desc = 1 THEN price END) as close,
          COALESCE(MAX(volume), 0) as volume,
          COALESCE(SUM(turnover), 0) as turnover,
          COUNT(*) as tick_count
        FROM ordered_ticks
        GROUP BY symbol
        HAVING COUNT(*) > 0
      `);

      const rows = result as any[];
      const queryDurationMs = Date.now() - startTime;
      const rowsReturned = rows ? rows.length : 0;
      const rowsScanned = rows ? rows.reduce((acc, row) => acc + Number(row.tick_count), 0) : 0;

      if (queryDurationMs > 1000) {
        logger.warn('OHLCEngine', 'Slow query detected during OHLC aggregation', {
          timeframe: tf,
          durationMs: queryDurationMs,
          rowsScanned,
          rowsReturned,
        });
      } else {
        logger.info('OHLCEngine', 'Aggregated ohlc candles query complete', {
          timeframe: tf,
          durationMs: queryDurationMs,
          rowsScanned,
          rowsReturned,
        });
      }

      if (!rows || rows.length === 0) return;

      // Batched upsert — ON CONFLICT updates existing candle if ticks arrive late
      const insertStart = Date.now();
      for (const row of rows) {
        const tickCount = Number(row.tick_count);
        if (tickCount === 0) continue;

        const open = Number(row.open);
        const high = Number(row.high);
        const low = Number(row.low);
        const close = Number(row.close);

        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) ||
            row.open === null || row.high === null || row.low === null || row.close === null) {
          logger.warn('OHLCEngine', `Skipping candle generation for ${row.symbol} due to NaN/null values`);
          continue;
        }

        await db.insert(ohlcCandles).values({
          symbol: row.symbol,
          timeframe: tf,
          open,
          high,
          low,
          close,
          volume: Number(row.volume),
          turnover: Number(row.turnover),
          tickCount,
          bucketStart,
          bucketEnd,
        }).onConflictDoUpdate({
          target: [ohlcCandles.symbol, ohlcCandles.timeframe, ohlcCandles.bucketStart],
          set: {
            high: sql`GREATEST(${ohlcCandles.high}, EXCLUDED.high)`,
            low: sql`LEAST(${ohlcCandles.low}, EXCLUDED.low)`,
            close: sql`EXCLUDED.close`,
            volume: sql`EXCLUDED.volume`,
            turnover: sql`EXCLUDED.turnover`,
            tickCount: sql`EXCLUDED.tick_count`,
          },
        });
      }
      metricsCollector.recordDbWrite(Date.now() - insertStart);

      // Cache latest candle per symbol in Redis for fast chart reads
      const redisStart = Date.now();
      const pipe = redis.pipeline();
      for (const row of rows) {
        const tickCount = Number(row.tick_count);
        if (tickCount === 0) continue;

        const open = Number(row.open);
        const high = Number(row.high);
        const low = Number(row.low);
        const close = Number(row.close);

        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) ||
            row.open === null || row.high === null || row.low === null || row.close === null) {
          continue;
        }

        const candle = {
          o: open,
          h: high,
          l: low,
          c: close,
          v: Number(row.volume),
          t: bucketStart.toISOString(),
        };
        pipe.hset(`candle:${tf}:${row.symbol}`, 'latest', JSON.stringify(candle));
        // Maintain a sorted set of candle timestamps per symbol per tf
        pipe.zadd(`candles:${tf}:${row.symbol}`, bucketStart.getTime(), JSON.stringify(candle));
        // Keep only the last 500 candles in Redis
        pipe.zremrangebyrank(`candles:${tf}:${row.symbol}`, 0, -501);
      }
      await pipe.exec();
      metricsCollector.recordRedisWrite(Date.now() - redisStart);

      logger.debug('OHLCEngine', `Aggregated ${tf} candles for ${rows.length} symbols`, {
        bucket: bucketStart.toISOString(),
      });
    } catch (error) {
      logger.error('OHLCEngine', `Failed to aggregate ${tf} candle`, error instanceof Error ? error.stack : String(error), {
        bucket: bucketStart.toISOString(),
      });
    } finally {
      await releaseLock(lockKey, ownerToken);
    }
  }

  /**
   * Aggregate the current (live, still-forming) candle for a timeframe.
   */
  async aggregateCurrentBucket(tf: Timeframe): Promise<void> {
    const now = new Date();
    const bucketStart = this.getBucketStart(now, tf);
    await this.aggregateBucket(tf, bucketStart);
  }

  /**
   * Aggregate the previous (just-closed) candle for a timeframe.
   */
  async aggregatePreviousBucket(tf: Timeframe): Promise<void> {
    const now = new Date();
    const currentBucket = this.getBucketStart(now, tf);
    const previousBucket = new Date(currentBucket.getTime() - TIMEFRAME_MS[tf]);
    await this.aggregateBucket(tf, previousBucket);
  }

  /**
   * Start continuous OHLC aggregation workers.
   * Each timeframe has its own cycle aligned to its interval.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('OHLCEngine', 'Starting OHLC aggregation workers');

    // 1-minute candles — aggregate every 15 seconds to keep current candle fresh
    this.runLoop('1m', 15_000);
    // 5-minute candles — every 30 seconds
    this.runLoop('5m', 30_000);
    // 15-minute candles — every 60 seconds
    this.runLoop('15m', 60_000);
    // 1-hour candles — every 2 minutes
    this.runLoop('1h', 120_000);
    // Daily candles — every 5 minutes
    this.runLoop('1d', 300_000);
  }

  stop() {
    this.isRunning = false;
  }

  private async runLoop(tf: Timeframe, intervalMs: number) {
    while (this.isRunning) {
      try {
        await this.aggregateCurrentBucket(tf);
        // Also backfill the just-closed bucket to catch late ticks
        await this.aggregatePreviousBucket(tf);
      } catch (err) {
        logger.error('OHLCEngine', `Loop error for ${tf}`, err);
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
}

export const ohlcEngine = new OHLCEngine();
