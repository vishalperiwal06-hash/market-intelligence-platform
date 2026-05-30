/**
 * Tick Persistence Worker
 *
 * Receives genuine ticks from the market pipeline via Redis Pub/Sub,
 * batches them, and writes them to tick_history in efficient bulk inserts.
 * Also handles breadth history and index snapshot persistence.
 */
import Redis from 'ioredis';
import { db } from '../../../lib/db';
import { tickHistory, breadthHistory, indexSnapshots, sectorHistory, marketSnapshots } from '../../../lib/db/schema';
import { redis } from '../../../lib/redis';
import { logger } from '../../../lib/logger';
import { getRedisUrl } from '../../../lib/runtime-env';
import { metricsCollector } from '../../../lib/metrics-collector';

const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 5_000;

interface TickBatch {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  close: number;
  exchange: string;
  timestamp: Date;
}

export class TickPersistenceWorker {
  private subscriber: Redis;
  private buffer: TickBatch[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private stats = {
    ticksReceived: 0,
    ticksPersisted: 0,
    batchesWritten: 0,
    errors: 0,
  };

  constructor() {
    this.subscriber = new Redis(getRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    this.subscriber.on('error', (error) => {
      logger.warn('TickPersistence', 'Subscriber Redis error', { error: error.message });
    });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('TickPersistence', 'Starting tick persistence worker');

    // Subscribe to market streams
    this.subscriber.connect().catch(() => {
      logger.warn('TickPersistence', 'Initial Redis connect failed; retrying through ioredis');
    });

    this.subscriber.subscribe(
      'market:stream:batch',
      'market:stream:breadth',
      'market:stream:indices',
      (err, count) => {
        if (err) {
          logger.error('TickPersistence', 'Failed to subscribe', err);
          return;
        }
        logger.info('TickPersistence', `Subscribed to ${count} persistence channels`);
      }
    );

    this.subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);

        if (channel === 'market:stream:batch') {
          this.handleTickBatch(data);
        } else if (channel === 'market:stream:breadth') {
          this.handleBreadthSnapshot(data);
        } else if (channel === 'market:stream:indices') {
          this.handleIndexSnapshot(data);
        }
      } catch (err) {
        logger.error('TickPersistence', 'Failed to parse message', err);
        this.stats.errors++;
      }
    });

    // Periodic flush timer
    this.flushTimer = setInterval(() => this.flushBuffer(), FLUSH_INTERVAL_MS);

    // Periodic sector rotation snapshot
    setInterval(() => this.persistSectorSnapshot(), 60_000);

    // Periodic stats logging
    setInterval(() => {
      logger.info('TickPersistence', 'Worker stats', this.stats);
    }, 30_000);
  }

  stop() {
    this.isRunning = false;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.subscriber.unsubscribe();
    this.flushBuffer(); // Final flush
  }

  private handleTickBatch(ticks: any[]) {
    for (const tick of ticks) {
      this.buffer.push({
        symbol: tick.symbol,
        price: tick.price,
        change: tick.change ?? 0,
        changePercent: tick.changePercent ?? 0,
        volume: tick.volume ?? 0,
        turnover: tick.turnover ?? 0,
        high: tick.high ?? tick.price,
        low: tick.low ?? tick.price,
        open: tick.open ?? tick.price,
        close: tick.close ?? tick.price,
        exchange: tick.exchange ?? 'NSE',
        timestamp: new Date(tick.timestamp || Date.now()),
      });
      this.stats.ticksReceived++;
    }

    if (this.buffer.length >= BATCH_SIZE) {
      this.flushBuffer();
    }
  }

  private async flushBuffer() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, BATCH_SIZE);
    const start = Date.now();

    try {
      await db.insert(tickHistory).values(batch);
      const duration = Date.now() - start;
      this.stats.ticksPersisted += batch.length;
      this.stats.batchesWritten++;
      metricsCollector.recordDbWrite(duration);
      metricsCollector.incrementTicks(batch.length);

      if (duration > 1000) {
        logger.warn('TickPersistence', 'Slow query detected during bulk tick insert', {
          durationMs: duration,
          rowCount: batch.length,
        });
      } else {
        logger.debug('TickPersistence', `Flushed ${batch.length} ticks to tick_history in ${duration}ms`);
      }
    } catch (error) {
      logger.error('TickPersistence', `Failed to flush ${batch.length} ticks`, error);
      this.stats.errors++;
      // Put failed ticks back at the front of the buffer for retry
      this.buffer.unshift(...batch);
    }
  }

  private async handleBreadthSnapshot(data: any) {
    try {
      await db.insert(breadthHistory).values({
        advances: data.advances ?? 0,
        declines: data.declines ?? 0,
        unchanged: data.unchanged ?? 0,
        advanceDeclineRatio:
          data.declines > 0 ? data.advances / data.declines : data.advances > 0 ? 999 : 0,
        timestamp: new Date(data.timestamp || Date.now()),
      });
    } catch (err) {
      logger.error('TickPersistence', 'Failed to persist breadth snapshot', err);
    }
  }

  private async handleIndexSnapshot(data: any[]) {
    try {
      const values = data.map(idx => ({
        indexName: idx.symbol || idx.name,
        value: idx.price,
        change: idx.change ?? 0,
        changePercent: idx.changePercent ?? 0,
        timestamp: new Date(),
      }));
      if (values.length > 0) {
        await db.insert(indexSnapshots).values(values);
      }
    } catch (err) {
      logger.error('TickPersistence', 'Failed to persist index snapshot', err);
    }
  }

  /**
   * Compute and persist sector rotation snapshot from live Redis data.
   */
  private async persistSectorSnapshot() {
    try {
      const symbolKeys = await redis.keys('market:tick:*');
      if (symbolKeys.length === 0) return;

      // Aggregate by sector — we read the sector from the cached tick data
      const sectorMap = new Map<string, {
        changes: number[];
        totalTurnover: number;
        totalVolume: number;
        advances: number;
        declines: number;
      }>();

      for (const key of symbolKeys) {
        const tick = await redis.hgetall(key);
        if (!tick || !tick.changePercent) continue;

        // Determine sector from company master cache or default to 'Unknown'
        const sector = tick.sector || 'Unknown';
        const change = parseFloat(tick.changePercent);
        const turnover = parseFloat(tick.turnover || '0');
        const volume = parseInt(tick.volume || '0', 10);

        if (!sectorMap.has(sector)) {
          sectorMap.set(sector, { changes: [], totalTurnover: 0, totalVolume: 0, advances: 0, declines: 0 });
        }

        const entry = sectorMap.get(sector)!;
        entry.changes.push(change);
        entry.totalTurnover += turnover;
        entry.totalVolume += volume;
        if (change > 0) entry.advances++;
        else if (change < 0) entry.declines++;
      }

      // Rank sectors by average change
      const sectorEntries = [...sectorMap.entries()]
        .map(([sector, data]) => ({
          sector,
          avgChange: data.changes.reduce((s, c) => s + c, 0) / data.changes.length,
          totalTurnover: data.totalTurnover,
          totalVolume: data.totalVolume,
          advances: data.advances,
          declines: data.declines,
        }))
        .sort((a, b) => b.avgChange - a.avgChange);

      const now = new Date();
      const values = sectorEntries.map((entry, idx) => ({
        ...entry,
        rank: idx + 1,
        timestamp: now,
      }));

      if (values.length > 0) {
        await db.insert(sectorHistory).values(values);

        // Also cache in Redis for fast reads
        await redis.set('market:sector_rotation', JSON.stringify(values), 'EX', 120);
      }
    } catch (err) {
      logger.error('TickPersistence', 'Failed to persist sector snapshot', err);
    }
  }
}

export const tickPersistenceWorker = new TickPersistenceWorker();
