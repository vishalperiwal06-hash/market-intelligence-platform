import { providerHealthEngine } from '../server/market-engine/orchestration/health';
import { redis } from './redis';

class BoundedCircularBuffer {
  private buffer: number[] = [];
  constructor(private capacity: number = 100) {}

  push(val: number) {
    this.buffer.push(val);
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  getStats() {
    if (this.buffer.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
    const sum = this.buffer.reduce((acc, v) => acc + v, 0);
    return {
      avg: Math.round((sum / this.buffer.length) * 10) / 10,
      min: Math.min(...this.buffer),
      max: Math.max(...this.buffer),
      count: this.buffer.length,
    };
  }
}

export class MetricsCollector {
  public dbWriteLatencies = new BoundedCircularBuffer(100);
  public redisLatencies = new BoundedCircularBuffer(100);
  public ticksProcessed = 0;
  private startTime = Date.now();
  private eventLoopLagMs = 0;
  private lastTime = Date.now();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      this.eventLoopLagMs = Math.max(0, now - this.lastTime - 1000);
      this.lastTime = now;

      // Memory Watermark Checks (Item 9)
      const mem = process.memoryUsage();
      const heapUsedPercent = Math.round((mem.heapUsed / mem.heapTotal) * 10000) / 100;
      const rssMB = Math.round(mem.rss / 1024 / 1024);
      if (heapUsedPercent > 85) {
        console.warn(`[WARN] Memory watermark warning: Heap usage is ${heapUsedPercent}% (Threshold: 85%), RSS is ${rssMB}MB.`);
      }
      if (this.eventLoopLagMs > 100) {
        console.warn(`[WARN] Event loop lag warning: Lag is ${this.eventLoopLagMs}ms (Threshold: 100ms)`);
      }
    }, 1000).unref();
  }

  recordDbWrite(latencyMs: number) {
    this.dbWriteLatencies.push(latencyMs);
  }

  recordRedisWrite(latencyMs: number) {
    this.redisLatencies.push(latencyMs);
  }

  incrementTicks(count: number) {
    this.ticksProcessed += count;
  }

  async getMetricsJSON() {
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    const ticksPerSec = Math.round((this.ticksProcessed / elapsedSec) * 100) / 100;

    let aiQueueDepth = 0;
    let parsingQueueDepth = 0;
    try {
      const waitJobs = await redis.llen('bull:ai-engine-queue:wait').catch(() => 0);
      const activeJobs = await redis.scard('bull:ai-engine-queue:active').catch(() => 0);
      aiQueueDepth = waitJobs + activeJobs;

      const pWaitJobs = await redis.llen('bull:parsing-queue:wait').catch(() => 0);
      const pActiveJobs = await redis.scard('bull:parsing-queue:active').catch(() => 0);
      parsingQueueDepth = pWaitJobs + pActiveJobs;
    } catch {}

    const providerStats = providerHealthEngine.getAllStats();
    const activeProviders = Object.keys(providerStats);
    const failedProviderCount = activeProviders.filter(p => providerStats[p].circuitBreakerOpen).length;

    return {
      status: 'success',
      uptimeSec: Math.round(elapsedSec),
      telemetry: {
        ticksPerSec,
        totalTicksProcessed: this.ticksProcessed,
        failedProviderCount,
        activeProviders: activeProviders.map(p => {
          const stats = providerStats[p];
          const total = (stats.successCount + stats.retryCount) || 1;
          const successPercent = Math.round((stats.successCount / total) * 10000) / 100;
          const timeoutPercent = Math.round((stats.timeoutCount / total) * 10000) / 100;
          const currentOpenTime = stats.circuitBreakerOpen && stats.circuitOpenedAt
            ? (Date.now() - stats.circuitOpenedAt)
            : 0;
          const totalOpenDurationMs = stats.circuitOpenDurationMs + currentOpenTime;

          return {
            name: p,
            circuitBreakerState: stats.circuitBreakerOpen ? 'OPEN' : 'CLOSED',
            avgLatencyMs: Math.round(stats.averageLatencyMs),
            successCount: stats.successCount,
            failureCount: stats.failureCount,
            retryCount: stats.retryCount,
            timeoutCount: stats.timeoutCount,
            successRatePercent: successPercent,
            timeoutRatePercent: timeoutPercent,
            circuitOpenDurationMs: totalOpenDurationMs,
          };
        }),
        database: {
          writeLatencyMs: this.dbWriteLatencies.getStats(),
        },
        redis: {
          writeLatencyMs: this.redisLatencies.getStats(),
        },
        queues: {
          aiQueueDepth,
          parsingQueueDepth,
        },
        system: {
          heapUsagePercent: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 10000) / 100,
          rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
          eventLoopLagMs: this.eventLoopLagMs,
        }
      }
    };
  }
}

export const metricsCollector = new MetricsCollector();
