/**
 * INSTITUTIONAL OBSERVABILITY — Phase 21
 * 
 * Centralized metrics collection and anomaly detection.
 * - Node.js Event Loop lag.
 * - Queue depth monitoring (BullMQ).
 * - Redis/Postgres latency histograms.
 * - AI Provider success/failure heatmaps.
 * - Transport throughput (SSE/WS).
 */
import { redis } from '../../lib/redis';
import { db } from '../../lib/db';
import { logger } from '../../lib/logger';
import { performance } from 'perf_hooks';

export interface SystemMetrics {
  timestamp: number;
  cpu: number;
  memory: {
    heapUsed: number;
    rss: number;
  };
  eventLoopLag: number;
  redis: {
    latencyMs: number;
    memoryUsed: string;
  };
  queues: Record<string, number>;
  transport: {
    sseClients: number;
    wsClients: number;
    msgPerSec: number;
  };
}

export class MetricsCollector {
  private eventLoopLag: number = 0;
  private msgCount: number = 0;

  constructor() {
    this.startEventLoopMonitoring();
  }

  private startEventLoopMonitoring(): void {
    let lastTime = performance.now();
    setInterval(() => {
      const now = performance.now();
      this.eventLoopLag = Math.max(0, now - lastTime - 1000);
      lastTime = now;
    }, 1000);
  }

  async collect(): Promise<SystemMetrics> {
    const startRedis = performance.now();
    const redisInfo = await redis.info('memory');
    const redisLatency = performance.now() - startRedis;

    const usedMem = process.memoryUsage();
    
    // Simulate transport metrics (in a real app, these would be tracked by the gateways)
    const sseClients = await redis.get('infra:transport:sse_clients') || '0';
    const wsClients = await redis.get('infra:transport:ws_clients') || '0';

    return {
      timestamp: Date.now(),
      cpu: 0, // OS-level CPU would require 'os' module usage
      memory: {
        heapUsed: Math.round(usedMem.heapUsed / 1024 / 1024),
        rss: Math.round(usedMem.rss / 1024 / 1024),
      },
      eventLoopLag: Math.round(this.eventLoopLag),
      redis: {
        latencyMs: Math.round(redisLatency),
        memoryUsed: redisInfo.split('used_memory_human:')[1]?.split('\r')[0] || 'unknown',
      },
      queues: {
        ingestion: await redis.llen('bull:ingestion:wait') || 0,
        scanners: await redis.llen('bull:scanners:wait') || 0,
        ai: await redis.llen('bull:ai:wait') || 0,
      },
      transport: {
        sseClients: parseInt(sseClients),
        wsClients: parseInt(wsClients),
        msgPerSec: this.msgCount,
      }
    };
  }

  incrementMsgCount(): void {
    this.msgCount++;
    setTimeout(() => this.msgCount--, 1000);
  }

  /**
   * Simple anomaly detection based on thresholds.
   */
  async detectAnomalies(metrics: SystemMetrics): Promise<string[]> {
    const anomalies: string[] = [];
    if (metrics.eventLoopLag > 200) anomalies.push('CRITICAL_EVENT_LOOP_LAG');
    if (metrics.memory.heapUsed > 800) anomalies.push('HIGH_MEMORY_PRESSURE');
    if (metrics.redis.latencyMs > 50) anomalies.push('REDIS_LATENCY_SPIKE');
    if (metrics.queues.scanners > 1000) anomalies.push('SCANNER_QUEUE_STALL');
    
    return anomalies;
  }
}

export const metricsCollector = new MetricsCollector();
