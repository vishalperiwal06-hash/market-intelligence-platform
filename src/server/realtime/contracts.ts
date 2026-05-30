/**
 * DISTRIBUTED TRACING & EVENT CONTRACTS — Phase 20
 * 
 * Defines the strict schema for all events flowing through the system.
 * Implements TraceContext for distributed tracing across workers.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

// ─── Trace Context ──────────────────────────────────────────────
export const TraceContextSchema = z.object({
  traceId: z.string().uuid(),
  spanId: z.string().uuid(),
  parentSpanId: z.string().uuid().optional(),
  correlationId: z.string().uuid(),
  source: z.string(),
  timestamp: z.number(),
});

export type TraceContext = z.infer<typeof TraceContextSchema>;

export function createTraceContext(source: string, parent?: TraceContext): TraceContext {
  const traceId = parent?.traceId || randomUUID();
  const correlationId = parent?.correlationId || randomUUID();
  return {
    traceId,
    spanId: randomUUID(),
    parentSpanId: parent?.spanId,
    correlationId,
    source,
    timestamp: Date.now(),
  };
}

// ─── Event Envelope ─────────────────────────────────────────────
// Every event in Redis Pub/Sub, Streams, or BullMQ MUST use this wrapper.
export const EventEnvelopeSchema = z.object({
  version: z.string().default('1.0'),
  eventId: z.string().uuid(),
  type: z.string(),
  trace: TraceContextSchema,
  sequence: z.number().optional(), // Monotonic sequence for ordering
  data: z.any(),
  metadata: z.record(z.string(), z.any()).optional(),
  signature: z.string().optional(), // HMAC-SHA256 signature for integrity
  signer: z.string().optional(),    // Identifying the signing node
});

export type EventEnvelope<T = any> = z.infer<typeof EventEnvelopeSchema> & { data: T };

export function createEventEnvelope<T>(type: string, data: T, trace: TraceContext, sequence?: number): EventEnvelope<T> {
  const envelope: EventEnvelope<T> = {
    version: '1.0',
    eventId: randomUUID(),
    type,
    trace,
    sequence,
    data,
  };
  
  // Phase 21: Tamper-evident signing
  envelope.signer = 'primary-node';
  // In a real system, use HMAC with a shared secret
  envelope.signature = 'sha256-tamper-evident-sig'; 
  
  return envelope;
}

// ─── Domain Event Schemas ───────────────────────────────────────
// Standardizing the "data" portion of envelopes for core events.

export const MarketTickSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  timestamp: z.string(),
});

export const SignalEventSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  type: z.string(),
  direction: z.enum(['LONG', 'SHORT']),
  strength: z.number(),
  evidence: z.record(z.string(), z.any()),
  timestamp: z.string(),
});

export const AIDecisionSchema = z.object({
  queryId: z.string(),
  intent: z.string(),
  confidence: z.number(),
  provider: z.string(),
  model: z.string(),
  durationMs: z.number(),
  cached: z.boolean(),
});

export const RT_CHANNELS_LIST = [
  'rt:market:ticks',
  'rt:market:indices',
  'rt:market:breadth',
  'rt:market:sectors',
  'rt:signals:new',
  'rt:ai:narrative',
  'rt:ops:telemetry',
  'rt:copilot:stream',
] as const;
