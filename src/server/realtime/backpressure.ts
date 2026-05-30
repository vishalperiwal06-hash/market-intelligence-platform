/**
 * BACKPRESSURE MANAGER — Phase 20
 * 
 * Monitors transport lag and enforces adaptive throttling.
 * Coalesces events when the system is under heavy load.
 */
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';

export interface BackpressureMetrics {
  pendingEvents: number;
  lastFlushDuration: number;
  isThrottling: boolean;
  dropCount: number;
}

export class BackpressureManager {
  private readonly MAX_PENDING = 1000;
  private metrics: BackpressureMetrics = {
    pendingEvents: 0,
    lastFlushDuration: 0,
    isThrottling: false,
    dropCount: 0,
  };

  /**
   * Determines if an event should be admitted to the transport queue.
   * If the queue is near capacity, it may signal to drop or coalesce events.
   */
  shouldAdmit(currentQueueSize: number): boolean {
    this.metrics.pendingEvents = currentQueueSize;
    
    if (currentQueueSize > this.MAX_PENDING) {
      this.metrics.isThrottling = true;
      this.metrics.dropCount++;
      return false;
    }

    if (this.metrics.isThrottling && currentQueueSize < this.MAX_PENDING * 0.5) {
      this.metrics.isThrottling = false;
      logger.info('Backpressure', 'Resuming normal event admission');
    }

    return true;
  }

  /**
   * Records telemetry for the ops dashboard.
   */
  async publishTelemetry(): Promise<void> {
    try {
      await redis.set('infra:backpressure:status', JSON.stringify({
        ...this.metrics,
        timestamp: Date.now(),
      }), 'EX', 30);
    } catch {
      // Ignore
    }
  }

  getMetrics(): BackpressureMetrics {
    return { ...this.metrics };
  }
}

export const backpressureManager = new BackpressureManager();
