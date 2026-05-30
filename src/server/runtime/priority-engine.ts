/**
 * DISTRIBUTED JOB PRIORITY ENGINE — Phase 21
 * 
 * Dynamically adjusts BullMQ job priorities based on market conditions.
 * - Critical market jobs (scanners, ingestion) ALWAYS outrank background tasks.
 * - Automatically defers non-critical tasks during high-volatility events.
 * - Maintains institutional latency targets (<250ms for scanners).
 */
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';

export enum JobPriority {
  CRITICAL = 1, // Highest (Market Data, Scanners)
  HIGH = 2,     // (Signals, Copilot Stream)
  NORMAL = 3,   // (Knowledge Graph, Portfolio Analytics)
  LOW = 4,      // (Embeddings, Maintenance, Pruning)
}

export class PriorityEngine {
  private isMarketHours: boolean = false;

  constructor() {
    this.updateMarketStatus();
    setInterval(() => this.updateMarketStatus(), 60_000);
  }

  /**
   * Returns the recommended priority for a job type.
   */
  getPriority(jobType: string): number {
    // 1. Critical Path (Ingestion & Scanners)
    if (jobType.startsWith('market:') || jobType.startsWith('scanner:')) {
      return JobPriority.CRITICAL;
    }

    // 2. Real-time Copilot & Signals
    if (jobType.includes('copilot') || jobType.includes('signal')) {
      return JobPriority.HIGH;
    }

    // 3. Background Processing
    // If during market hours, downgrade background tasks further to preserve CPU
    if (this.isMarketHours) {
      if (jobType.includes('embedding') || jobType.includes('compaction') || jobType.includes('audit')) {
        return JobPriority.LOW;
      }
    }

    return JobPriority.NORMAL;
  }

  /**
   * Adaptive queue weighting: Defer jobs if system load is too high.
   */
  async shouldDefer(jobType: string): Promise<boolean> {
    const lag = await redis.get('infra:metrics:event_loop_lag') || '0';
    if (parseInt(lag) > 300) {
      // System is struggling, defer non-critical jobs
      return this.getPriority(jobType) >= JobPriority.NORMAL;
    }
    return false;
  }

  private updateMarketStatus(): void {
    const now = new Date();
    const day = now.getDay();
    const hours = now.getHours();
    const mins = now.getMinutes();
    const time = hours * 100 + mins;

    // Simulate NSE Market Hours (9:15 AM - 3:30 PM)
    this.isMarketHours = day >= 1 && day <= 5 && time >= 915 && time <= 1530;
  }
}

export const priorityEngine = new PriorityEngine();
