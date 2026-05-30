import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

export class CircuitBreaker {
  private readonly config = {
    maxFailures: 5,
    resetTimeoutMs: 30_000, // 30s open window
  };

  /**
   * Records a failure for a specific service dependency.
   * If failures exceed threshold, the circuit trips (opens).
   */
  async recordFailure(serviceName: string): Promise<void> {
    const key = `circuit:${serviceName}`;
    try {
      const failures = await redis.incr(`${key}:failures`);
      await redis.set(`${key}:last_failure`, Date.now().toString());

      if (failures === 1) {
        // Expire failure counts after 5 mins to prevent slow accumulation tripping
        await redis.expire(`${key}:failures`, 300);
      }

      if (failures >= this.config.maxFailures) {
        logger.error('CircuitBreaker', `Circuit tripped for ${serviceName} after ${failures} failures`);
      }
    } catch (e: any) {
      logger.warn('CircuitBreaker', 'Failed to record failure in Redis', { error: e.message });
    }
  }

  /**
   * Records a successful execution, resetting the failure count.
   */
  async recordSuccess(serviceName: string): Promise<void> {
    const key = `circuit:${serviceName}`;
    try {
      await redis.del(`${key}:failures`);
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Checks if the circuit is currently OPEN (meaning requests should fail fast).
   */
  async isOpen(serviceName: string): Promise<boolean> {
    const key = `circuit:${serviceName}`;
    try {
      const failures = parseInt(await redis.get(`${key}:failures`) || '0');
      const lastFailure = parseInt(await redis.get(`${key}:last_failure`) || '0');

      if (failures >= this.config.maxFailures) {
        // Check if reset timeout has elapsed
        if (Date.now() - lastFailure > this.config.resetTimeoutMs) {
          // Half-open state: allow a request to try
          return false;
        }
        return true;
      }
      return false;
    } catch (e) {
      // Fail-closed if Redis is down (allow requests)
      return false;
    }
  }

  /**
   * Executes a function with circuit breaker protection.
   * Throws immediately if the circuit is open.
   */
  async execute<T>(serviceName: string, action: () => Promise<T>): Promise<T> {
    if (await this.isOpen(serviceName)) {
      throw new Error(`CircuitBreaker: ${serviceName} is temporarily unavailable`);
    }

    try {
      const result = await action();
      await this.recordSuccess(serviceName);
      return result;
    } catch (error) {
      await this.recordFailure(serviceName);
      throw error;
    }
  }
}

export const circuitBreaker = new CircuitBreaker();
