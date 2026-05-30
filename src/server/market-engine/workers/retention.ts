/**
 * Data Retention & Cleanup Worker
 *
 * Manages database size by implementing retention policies.
 * - tick_history: 7 days (raw ticks are aggregated into candles)
 * - breadth_history: 90 days
 * - sector_history: 180 days
 * - index_snapshots: 365 days
 * - ohlc_candles (1m): 30 days
 * - ohlc_candles (5m/15m): 90 days
 * - ohlc_candles (1h/1d): indefinite
 * - technical_indicators: 30 days (latest is always cached in Redis)
 */
import { db } from '../../../lib/db';
import { logger } from '../../../lib/logger';
import { sql } from 'drizzle-orm';
import { acquireLock, releaseLock } from '../../../lib/redis';
import { Queue } from 'bullmq';
import { metricsCollector } from '../../../lib/metrics-collector';

interface RetentionPolicy {
  table: string;
  condition: string;
  description: string;
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    table: 'tick_history',
    condition: `timestamp < NOW() - INTERVAL '7 days'`,
    description: 'Raw ticks older than 7 days',
  },
  {
    table: 'breadth_history',
    condition: `timestamp < NOW() - INTERVAL '90 days'`,
    description: 'Breadth snapshots older than 90 days',
  },
  {
    table: 'sector_history',
    condition: `timestamp < NOW() - INTERVAL '180 days'`,
    description: 'Sector rotation data older than 180 days',
  },
  {
    table: 'index_snapshots',
    condition: `timestamp < NOW() - INTERVAL '365 days'`,
    description: 'Index snapshots older than 1 year',
  },
  {
    table: 'ohlc_candles',
    condition: `bucket_start < NOW() - INTERVAL '30 days' AND timeframe = '1m'`,
    description: '1m candles older than 30 days',
  },
  {
    table: 'ohlc_candles',
    condition: `bucket_start < NOW() - INTERVAL '90 days' AND timeframe IN ('5m', '15m')`,
    description: '5m/15m candles older than 90 days',
  },
  {
    table: 'technical_indicators',
    condition: `timestamp < NOW() - INTERVAL '30 days'`,
    description: 'Computed indicators older than 30 days',
  },
];

export class RetentionWorker {
  private isRunning = false;

  async runCleanup(): Promise<void> {
    const lockKey = 'lock:retention:cleanup';
    const ownerToken = `retention:${Math.random().toString(36).substring(2, 11)}`;
    const acquired = await acquireLock(lockKey, ownerToken, 600000); // 10 min TTL
    if (!acquired) {
      logger.debug('RetentionWorker', 'Retention cleanup already running or handled by another instance');
      return;
    }

    try {
      logger.info('RetentionWorker', 'Starting data retention cleanup');

      for (const policy of RETENTION_POLICIES) {
        const queryStart = Date.now();
        try {
          const result = await db.execute(
            sql.raw(`DELETE FROM ${policy.table} WHERE ${policy.condition}`)
          );
          const queryDurationMs = Date.now() - queryStart;
          const count = (result as any).rowCount ?? 0;
          
          metricsCollector.recordDbWrite(queryDurationMs);

          if (queryDurationMs > 2000) {
            logger.warn('RetentionWorker', 'Slow delete query detected during retention cleanup', {
              table: policy.table,
              durationMs: queryDurationMs,
              rowsDeleted: count,
            });
          } else {
            logger.info('RetentionWorker', 'Retention cleanup query complete', {
              table: policy.table,
              durationMs: queryDurationMs,
              rowsScanned: count,
              rowsDeleted: count,
            });
          }

          if (count > 0) {
            logger.info('RetentionWorker', `Cleaned ${count} rows: ${policy.description}`);
          }
        } catch (err) {
          logger.error('RetentionWorker', `Failed cleanup for ${policy.table}`, err);
        }
      }

      // Run VACUUM ANALYZE on cleaned tables (async, non-blocking)
      try {
        for (const table of ['tick_history', 'ohlc_candles', 'technical_indicators']) {
          await db.execute(sql.raw(`ANALYZE ${table}`));
        }
        logger.info('RetentionWorker', 'Post-cleanup ANALYZE complete');
      } catch (err) {
        logger.error('RetentionWorker', 'ANALYZE failed', err);
      }

      // Prune BullMQ Queue Jobs older than 24h
      const connection = (() => {
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
          try {
            const url = new URL(redisUrl);
            return {
              host: url.hostname,
              port: parseInt(url.port || '6379'),
              username: url.username || undefined,
              password: url.password || undefined,
            };
          } catch (e) {
            // ignore
          }
        }
        return {
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        };
      })();

      try {
        const aiQueue = new Queue('ai-engine-queue', { connection });
        await aiQueue.clean(24 * 3600 * 1000, 1000, 'completed');
        await aiQueue.clean(24 * 3600 * 1000, 1000, 'failed');
        await aiQueue.close();

        const parsingQueue = new Queue('parsing-queue', { connection });
        await parsingQueue.clean(24 * 3600 * 1000, 1000, 'completed');
        await parsingQueue.clean(24 * 3600 * 1000, 1000, 'failed');
        await parsingQueue.close();

        logger.info('RetentionWorker', 'BullMQ queue pruning complete');
      } catch (qErr) {
        logger.error('RetentionWorker', 'Failed to prune queues', qErr);
      }
    } finally {
      await releaseLock(lockKey, ownerToken);
    }
  }

  /**
   * Create a full end-of-day market snapshot for archival.
   */
  async createEODSnapshot(): Promise<void> {
    try {
      // This creates a JSONB snapshot of all current market ticks
      const result = await db.execute(sql`
        SELECT json_agg(json_build_object(
          'symbol', symbol,
          'price', price,
          'change', change,
          'change_percent', change_percent,
          'volume', volume,
          'turnover', turnover,
          'high', high,
          'low', low,
          'open', open,
          'close', close
        )) as data
        FROM (
          SELECT DISTINCT ON (symbol) *
          FROM tick_history
          WHERE timestamp >= CURRENT_DATE
          ORDER BY symbol, timestamp DESC
        ) latest_ticks
      `);

      const snapshotData = ((result as any[])[0] as any)?.data;
      if (snapshotData) {
        await db.execute(sql`
          INSERT INTO market_snapshots (snapshot_type, data, timestamp)
          VALUES ('eod', ${JSON.stringify(snapshotData)}::jsonb, NOW())
        `);
        logger.info('RetentionWorker', 'EOD snapshot created');
      }
    } catch (err) {
      logger.error('RetentionWorker', 'EOD snapshot failed', err);
    }
  }

  /**
   * Start retention worker — runs cleanup once per hour and EOD snapshot at 3:35 PM IST.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('RetentionWorker', 'Starting retention worker');

    // Hourly cleanup
    setInterval(() => this.runCleanup(), 3_600_000);

    // EOD snapshot check every minute
    setInterval(() => {
      const now = new Date();
      const istHours = (now.getUTCHours() + 5) % 24;
      const istMinutes = (now.getUTCMinutes() + 30) % 60;
      // 3:35 PM IST = market close + 5 minutes
      if (istHours === 15 && istMinutes === 35) {
        this.createEODSnapshot();
      }
    }, 60_000);
  }

  stop() {
    this.isRunning = false;
  }
}

export const retentionWorker = new RetentionWorker();
