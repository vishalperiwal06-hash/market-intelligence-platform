# Incident Response & Disaster Recovery

## 1. Complete Database Loss (PostgreSQL)
1. Stop application containers: `docker compose stop app`
2. Restore from backup volume: `docker exec -i aibazaar-db psql -U aibazaar aibazaar < backup_YYYYMMDD.sql`
3. Restart containers: `docker compose start app`

## 2. Ingestion Pipeline Halt
If real-time market ingestion stops:
1. Check `/ops` dashboard for `Redis Key Count` stagnation.
2. If queues are deadlocked, flush BullMQ: `redis-cli flushall` (Note: clears cache, but preserves PostgreSQL source of truth).
3. Restart `app` to trigger background ingestion jobs.

## 3. AI Cloud Outage
If Groq or DeepSeek goes down:
1. The orchestrator automatically falls back to Ollama.
2. If latency spikes, force Local-Only Mode by enabling the `force_local_ai` feature flag:
   `npx tsx scripts/toggle-flag.ts force_local_ai 1`
   
## 4. Prompt Injection / Auth Breach
1. Disable login immediately: `npx tsx scripts/toggle-flag.ts auth_enabled 0`
2. Purge active sessions: `DELETE FROM user_sessions;`
3. Check `audit_logs` table for breach surface.
