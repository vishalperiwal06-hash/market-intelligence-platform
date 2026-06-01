/**
 * Provider Health Engine
 * 
 * Tracks latency, success rates, and disconnect frequency of data providers.
 * Triggers circuit breakers if a provider degrades.
 */
import { redis } from '../../../lib/redis';
import { logger } from '../../../lib/logger';

export interface HealthStats {
  successCount: number;
  failureCount: number;
  averageLatencyMs: number;
  lastFailureTime?: number;
  circuitBreakerOpen: boolean;
  circuitBreakerOpenTime?: number;
  consecutiveTrips?: number;
  // Item 6: Provider success-rate telemetry
  timeoutCount: number;
  retryCount: number;
  circuitOpenDurationMs: number;
  circuitOpenedAt?: number;
}

export class ProviderHealthEngine {
  private stats = new Map<string, HealthStats>();
  
  // Config
  private readonly ERROR_THRESHOLD = 3; // Failures before trip (reduced for fast Yahoo failover)

  initProvider(name: string) {
    if (!this.stats.has(name)) {
      this.stats.set(name, {
        successCount: 0,
        failureCount: 0,
        averageLatencyMs: 0,
        circuitBreakerOpen: false,
        consecutiveTrips: 0,
        timeoutCount: 0,
        retryCount: 0,
        circuitOpenDurationMs: 0,
      });
    }
  }

  async recordSuccess(name: string, latencyMs: number) {
    this.initProvider(name);
    const s = this.stats.get(name)!;
    
    // Exponential moving average for latency
    s.averageLatencyMs = s.averageLatencyMs === 0 ? latencyMs : (s.averageLatencyMs * 0.8) + (latencyMs * 0.2);
    s.successCount++;
    s.failureCount = 0; // Reset consecutive failures
    
    // Close circuit breaker if it was open (successful retry)
    if (s.circuitBreakerOpen) {
      s.circuitBreakerOpen = false;
      s.consecutiveTrips = 0; // Reset consecutive trips
      if (s.circuitOpenedAt) {
        s.circuitOpenDurationMs += (Date.now() - s.circuitOpenedAt);
        s.circuitOpenedAt = undefined;
      }
      logger.info('ProviderHealthEngine', `Circuit breaker CLOSED for ${name}`);
    } else {
      s.consecutiveTrips = 0; // Reset just in case
    }

    await this.persistState(name, s);
  }

  async recordFailure(name: string, error: Error) {
    this.initProvider(name);
    const s = this.stats.get(name)!;
    const now = Date.now();
    
    s.failureCount++;
    s.retryCount++;
    s.lastFailureTime = now;

    // Detect if this is a timeout/abort error
    const msg = error.message ? error.message.toLowerCase() : '';
    const isTimeout = msg.includes('timeout') || msg.includes('abort') || (error as any).code === 'ETIMEDOUT';
    if (isTimeout) {
      s.timeoutCount++;
    }

    if (s.circuitBreakerOpen) {
      s.consecutiveTrips = (s.consecutiveTrips || 0) + 1;
      s.circuitBreakerOpenTime = now; // reset the opening time to now to restart the backoff timer
      s.failureCount = 0; // Reset count
      logger.error('ProviderHealthEngine', `Circuit breaker TRIP extended/reopened for ${name} (Trip #${s.consecutiveTrips}) due to failed half-open retry. Error: ${error.message}`);
    } else if (s.failureCount >= this.ERROR_THRESHOLD) {
      s.circuitBreakerOpen = true;
      s.circuitBreakerOpenTime = now;
      s.circuitOpenedAt = now; // Track start of circuit open duration
      s.consecutiveTrips = (s.consecutiveTrips || 0) + 1;
      logger.error('ProviderHealthEngine', `Circuit breaker OPENED for ${name} after ${s.failureCount} failures (Trip #${s.consecutiveTrips}). Error: ${error.message}`);
    }

    await this.persistState(name, s);
  }

  isHealthy(name: string): boolean {
    const s = this.stats.get(name);
    if (!s) return true; // Default to healthy

    if (s.circuitBreakerOpen) {
      // Check if we should transition to Half-Open state using exponential backoff
      const now = Date.now();
      const trips = s.consecutiveTrips || 1;
      // 30s * 2^(trips - 1), capped at 15 minutes (900,000 ms)
      const cooldownMs = Math.min(30_000 * Math.pow(2, trips - 1), 900_000);
      
      if (s.circuitBreakerOpenTime && (now - s.circuitBreakerOpenTime > cooldownMs)) {
        logger.warn('ProviderHealthEngine', `Circuit breaker HALF-OPEN for ${name}. Cooldown of ${cooldownMs / 1000}s elapsed. Allowing retry.`);
        return true; 
      }
      return false;
    }
    return true;
  }

  getStats(name: string): HealthStats | undefined {
    return this.stats.get(name);
  }

  getAllStats(): Record<string, HealthStats> {
    const res: Record<string, HealthStats> = {};
    for (const [k, v] of this.stats.entries()) {
      res[k] = { ...v };
    }
    return res;
  }

  private async persistState(name: string, s: HealthStats) {
    // Cache to Redis for observability
    await redis.hset(`provider:health:${name}`, {
      successCount: s.successCount,
      failureCount: s.failureCount,
      latency: Math.round(s.averageLatencyMs),
      circuitBreaker: s.circuitBreakerOpen ? 'OPEN' : 'CLOSED',
    });
  }
}

export const providerHealthEngine = new ProviderHealthEngine();
