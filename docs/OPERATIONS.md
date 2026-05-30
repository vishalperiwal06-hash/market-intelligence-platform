# Operations & Runbook (Phase 17)

## Overview
This document covers daily operations, telemetry analysis, and maintenance for the AI Bazaar institutional terminal.

## Worker Management (BullMQ)
Workers run continuously to ingest NSE/BSE data, generate semantic vectors, and update portfolios.
- **Queue Dashboard**: Available at `/ops`
- **Restarting Workers**: In Docker, `docker compose restart app` will reboot the Next.js edge runtime and background workers safely. Queues persist in Redis.

## Feature Flags
Feature toggles are managed via the `FeatureFlagEngine` (Redis + Postgres).
Use the CLI `npx tsx scripts/toggle-flag.ts <flag_key> <0|1>` (or directly edit Postgres `feature_flags` table) to disable AI pipelines if Cloud APIs fail and Ollama is overloaded.

## Log Traceability
All requests generate a correlation ID. Filter logs using `grep -R "req_id_123" logs/`.
Database slow queries are logged via Drizzle's custom logger if > 500ms.

## Circuit Breakers
If the Semantic Engine or Copilot fail 5 consecutive times, the `CircuitBreaker` will open for 30 seconds, returning 503s to prevent cascading failures on Redis/PostgreSQL.
