/**
 * IDEMPOTENCY & TRACING UTILITIES — Phase 20
 * 
 * Provides:
 * 1. IdempotencyService: Prevents duplicate processing of the same eventId.
 * 2. Tracer: Manages trace context propagation across async worker boundaries.
 */
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { TraceContext, createTraceContext } from './contracts';

export class IdempotencyService {
  private readonly ttl = 300; // 5 minute deduplication window

  /**
   * Checks if an operation with the given key has already been performed.
   * If not, it marks it as performed.
   */
  async isDuplicate(key: string, namespace: string = 'global'): Promise<boolean> {
    const fullKey = `idemp:${namespace}:${key}`;
    try {
      const result = await redis.set(fullKey, '1', 'EX', this.ttl, 'NX');
      return result === null; // If result is null, it already existed
    } catch (e: any) {
      logger.warn('Idempotency', 'Redis check failed, allowing operation', { error: e.message });
      return false;
    }
  }
}

export class Tracer {
  /**
   * Wraps an async operation with trace logging and error tracking.
   */
  static async trace<T>(
    context: string,
    trace: TraceContext,
    operation: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    logger.debug('Tracer', `[${context}] Starting span`, { 
      traceId: trace.traceId, 
      spanId: trace.spanId,
      correlationId: trace.correlationId
    });

    try {
      const result = await operation();
      const duration = Date.now() - start;
      
      // Log trace metrics to Redis for the Ops Dashboard
      await redis.hincrby(`trace:metrics:${new Date().toISOString().split('T')[0]}`, `${context}:count`, 1);
      await redis.hset(`trace:latency:${context}`, trace.traceId, duration);

      return result;
    } catch (error: any) {
      logger.error('Tracer', `[${context}] Span failed`, error, {
        traceId: trace.traceId,
        spanId: trace.spanId,
      });
      throw error;
    }
  }

  /**
   * Creates a child trace context for nested operations.
   */
  static child(parent: TraceContext, source: string): TraceContext {
    return createTraceContext(source, parent);
  }
}

export const idempotency = new IdempotencyService();
