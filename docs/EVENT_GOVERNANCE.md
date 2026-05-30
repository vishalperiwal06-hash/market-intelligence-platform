# Distributed Systems & Event Governance — Phase 20

## 1. Event Naming & Versioning
- **Naming**: `namespace:entity:action` (e.g., `market:signal:created`)
- **Versioning**: All `EventEnvelope` objects must include a `version` field (default `1.0`).
- **Compatibility**: Subscribers must handle unknown fields gracefully. Breaking changes require a version bump.

## 2. Distributed Tracing Guarantees
- **Trace Propagation**: Every operation must carry a `TraceContext`.
- **Causality**: `parentSpanId` must be correctly linked in child operations.
- **Correlation**: `correlationId` must persist across the entire lifecycle of a request (from ingestion to AI response).

## 3. Idempotency & Deduplication
- **Window**: 5-minute sliding window for deduplication via Redis.
- **Key Strategy**: `namespace:eventId` or `namespace:businessKey`.
- **Retries**: Workers must be idempotent under retries. `isDuplicate()` check is mandatory for all non-idempotent writes.

## 4. Replay & Consistency
- **Replay Window**: 1-hour forensic replay window via Redis Streams.
- **State Reconciliation**: Periodic (5m) worker synchronizes Redis hot-state with PostgreSQL.
- **Monotonicity**: Events include a `timestamp` and optional `sequence` to detect out-of-order delivery.

## 5. AI Determinism
- **Context Hashing**: Prompt context must be hashed using SHA-256 to detect change/duplication.
- **Audit Logs**: Every AI response is logged with its exact prompt, model, and context snapshot.
- **Transparency**: AI responses must be reconstructable from their trace context.
