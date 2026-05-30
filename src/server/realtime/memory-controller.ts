/**
 * MEMORY & REDIS PRESSURE CONTROLLER — Phase 19
 *
 * Monitors and enforces memory safety across:
 * - Redis key space (TTL enforcement, stream trimming)
 * - Node.js heap (V8 heap stats monitoring)
 * - Queue retention (BullMQ job pruning)
 * - WebSocket connection pressure
 *
 * Runs as a periodic background worker.
 * All metrics are published to the ops telemetry stream.
 */
import { redis } from '../../lib/redis';
import { eventBus, RT_CHANNELS, RT_STREAMS } from './event-bus';
import { logger } from '../../lib/logger';
import { createTraceContext, createEventEnvelope } from './contracts';

// ─── Thresholds ─────────────────────────────────────────────────
const REDIS_MAX_MEMORY_MB = 512;         // Alert if Redis exceeds 512MB
const NODE_HEAP_WARNING_MB = 1024;       // Alert if Node heap exceeds 1GB
const STREAM_TRIM_TARGET = 5000;         // Keep at most 5000 entries per stream
const STALE_CACHE_SCAN_BATCH = 100;      // Keys per SCAN iteration

export interface MemoryReport {
  timestamp: number;
  redis: {
    usedMemoryMB: number;
    keyCount: number;
    connectedClients: number;
    streamLengths: Record<string, number>;
    isOverPressure: boolean;
  };
  node: {
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rss: number;
    isOverPressure: boolean;
  };
  actions: string[];
}

export class MemoryPressureController {
  private interval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start the controller. Runs every 60 seconds.
   */
  start(intervalMs: number = 60_000): void {
    logger.info('MemoryController', 'Starting memory pressure monitoring');

    // Run immediately, then on interval
    this.runCycle();
    this.interval = setInterval(() => this.runCycle(), intervalMs);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async runCycle(): Promise<MemoryReport> {
    const actions: string[] = [];

    // ─── 1. Redis Memory Check ──────────────────────────────
    const redisInfo = await this.getRedisMemoryInfo();

    if (redisInfo.isOverPressure) {
      actions.push(`Redis memory critical: ${redisInfo.usedMemoryMB}MB > ${REDIS_MAX_MEMORY_MB}MB threshold`);
      await this.performRedisCleanup();
      actions.push('Performed emergency Redis cleanup');
    }

    // ─── 2. Stream Trimming ─────────────────────────────────
    const streamLengths = await this.trimStreams();

    // ─── 3. Node.js Heap Check ──────────────────────────────
    const nodeInfo = this.getNodeMemoryInfo();

    if (nodeInfo.isOverPressure) {
      actions.push(`Node heap critical: ${nodeInfo.heapUsedMB}MB > ${NODE_HEAP_WARNING_MB}MB threshold`);
      // Force GC if exposed (requires --expose-gc flag)
      if (global.gc) {
        global.gc();
        actions.push('Forced garbage collection');
      }
    }

    // ─── 4. Queue Pruning ───────────────────────────────────
    const pruned = await this.pruneCompletedJobs();
    if (pruned > 0) {
      actions.push(`Pruned ${pruned} completed BullMQ jobs`);
    }

    // ─── Build Report ───────────────────────────────────────
    const report: MemoryReport = {
      timestamp: Date.now(),
      redis: { ...redisInfo, streamLengths },
      node: nodeInfo,
      actions,
    };

    // Publish to ops telemetry
    try {
      const trace = createTraceContext('MemoryController');
      const envelope = createEventEnvelope('infra:memory:report', report, trace);
      await eventBus.publish(RT_CHANNELS.OPS_TELEMETRY, envelope);
    } catch {
      // Telemetry failure is non-fatal
    }

    if (actions.length > 0) {
      logger.info('MemoryController', `Cycle complete: ${actions.length} actions taken`, { actions });
    }

    return report;
  }

  // ─── Redis Memory Info ──────────────────────────────────────
  private async getRedisMemoryInfo(): Promise<{
    usedMemoryMB: number;
    keyCount: number;
    connectedClients: number;
    isOverPressure: boolean;
  }> {
    try {
      const info = await redis.info('memory');
      const usedBytes = parseInt(info.match(/used_memory:(\d+)/)?.[1] || '0');
      const usedMB = Math.round(usedBytes / 1024 / 1024);

      const keyspaceInfo = await redis.info('keyspace');
      const keyMatch = keyspaceInfo.match(/keys=(\d+)/);
      const keyCount = parseInt(keyMatch?.[1] || '0');

      const clientInfo = await redis.info('clients');
      const clientMatch = clientInfo.match(/connected_clients:(\d+)/);
      const connectedClients = parseInt(clientMatch?.[1] || '0');

      return {
        usedMemoryMB: usedMB,
        keyCount,
        connectedClients,
        isOverPressure: usedMB > REDIS_MAX_MEMORY_MB,
      };
    } catch {
      return { usedMemoryMB: 0, keyCount: 0, connectedClients: 0, isOverPressure: false };
    }
  }

  // ─── Node.js Heap Info ──────────────────────────────────────
  private getNodeMemoryInfo(): {
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rss: number;
    isOverPressure: boolean;
  } {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    return {
      heapUsedMB,
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
      isOverPressure: heapUsedMB > NODE_HEAP_WARNING_MB,
    };
  }

  // ─── Stream Trimming ────────────────────────────────────────
  private async trimStreams(): Promise<Record<string, number>> {
    const lengths: Record<string, number> = {};
    const streams = Object.values(RT_STREAMS);

    for (const stream of streams) {
      try {
        const len = await redis.xlen(stream);
        lengths[stream] = len;
        if (len > STREAM_TRIM_TARGET) {
          await redis.xtrim(stream, 'MAXLEN', '~', STREAM_TRIM_TARGET);
          logger.debug('MemoryController', `Trimmed stream ${stream}: ${len} → ~${STREAM_TRIM_TARGET}`);
        }
      } catch {
        lengths[stream] = 0;
      }
    }
    return lengths;
  }

  // ─── Emergency Redis Cleanup ────────────────────────────────
  private async performRedisCleanup(): Promise<void> {
    try {
      // 1. Trim all streams aggressively
      for (const stream of Object.values(RT_STREAMS)) {
        await redis.xtrim(stream, 'MAXLEN', '~', 1000);
      }

      // 2. Scan for expired copilot caches (6hr TTL should handle this)
      let cursor = '0';
      do {
        const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'copilot:cache:*', 'COUNT', STALE_CACHE_SCAN_BATCH);
        cursor = newCursor;
        // These should already have TTLs, but enforce cleanup
        for (const key of keys) {
          const ttl = await redis.ttl(key);
          if (ttl === -1) {
            // No TTL set — enforce 6hr
            await redis.expire(key, 21600);
          }
        }
      } while (cursor !== '0');

      // 3. Clean up stale API caches without TTL
      cursor = '0';
      do {
        const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'api:*', 'COUNT', STALE_CACHE_SCAN_BATCH);
        cursor = newCursor;
        for (const key of keys) {
          const ttl = await redis.ttl(key);
          if (ttl === -1) {
            await redis.expire(key, 60); // Force 60s TTL
          }
        }
      } while (cursor !== '0');
    } catch (err: any) {
      logger.warn('MemoryController', 'Redis cleanup failed', { error: err.message });
    }
  }

  // ─── BullMQ Job Pruning ─────────────────────────────────────
  private async pruneCompletedJobs(): Promise<number> {
    let pruned = 0;
    try {
      // Scan for BullMQ completed job keys older than 1 hour
      let cursor = '0';
      do {
        const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'bull:*:completed', 'COUNT', 50);
        cursor = newCursor;
        for (const key of keys) {
          const removed = await redis.zremrangebyscore(key, '-inf', String(Date.now() - 3_600_000));
          pruned += removed;
        }
      } while (cursor !== '0');
    } catch {
      // Non-fatal
    }
    return pruned;
  }
}

export const memoryController = new MemoryPressureController();
