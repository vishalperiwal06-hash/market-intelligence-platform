/**
 * AI DETERMINISM & AUDITABILITY — Phase 20
 * 
 * Ensures AI outputs are grounded in immutable context snapshots.
 * Implements context hashing and audit logging.
 */
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { aiAuditLogs } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { TraceContext } from '@/server/realtime/contracts';

export class AIDeterminism {
  /**
   * Generates a deterministic hash for a given context object.
   * Useful for identifying duplicate reasoning tasks.
   */
  static hashContext(context: any): string {
    const canonical = JSON.stringify(context, Object.keys(context).sort());
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Logs a complete reasoning snapshot to the database for forensic audit.
   */
  static async logAudit(params: {
    trace: TraceContext;
    provider: string;
    model: string;
    prompt: string;
    response: string;
    contextHash: string;
    rawContext: any;
    durationMs: number;
  }): Promise<void> {
    try {
      await db.insert(aiAuditLogs).values({
        traceId: params.trace.traceId,
        correlationId: params.trace.correlationId,
        provider: params.provider,
        model: params.model,
        prompt: params.prompt,
        response: params.response,
        contextHash: params.contextHash,
        rawContext: params.rawContext,
        durationMs: params.durationMs,
        timestamp: new Date(),
      });
    } catch (err) {
      logger.error('AIDeterminism', 'Audit logging failed', err);
    }
  }
}
