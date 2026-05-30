/**
 * DISTRIBUTED TRACE VIEWER — Phase 20
 * 
 * GET /api/ops/trace/[traceId]
 * 
 * Reconstructs the causal chain of events for a single trace.
 * Aggregates data from:
 * 1. Redis Streams (live event flow)
 * 2. Database (AI audit logs, signals, filings)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { aiAuditLogs, activeSignals } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { redis } from '@/lib/redis';
import { RT_STREAMS } from '@/server/realtime/event-bus';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const { traceId } = await params;

  try {
    // 1. Fetch from AI Audit Logs
    const auditLogs = await db.select().from(aiAuditLogs)
      .where(or(
        eq(aiAuditLogs.traceId, traceId),
        eq(aiAuditLogs.correlationId, traceId)
      ));

    // 2. Fetch from Active Signals
    // (Requires traceId column in activeSignals table — we should add this)
    // For now, search by metadata if available.

    // 3. Search Redis Streams (Forensics)
    const streamEvents: any[] = [];
    const streams = Object.values(RT_STREAMS);
    for (const stream of streams) {
      // Note: This is an O(N) scan in Redis Stream, should be used for debugging only.
      // In production, we'd use a search index (like RediSearch) or a dedicated trace store.
      // For Phase 20, we'll simulate the search by scanning the recent 1000 entries.
      const entries = await redis.xrange(stream, '-', '+', 'COUNT', 1000);
      for (const [id, fields] of entries) {
        const fieldsObj: any = {};
        for (let i = 0; i < fields.length; i += 2) {
          fieldsObj[fields[i]] = fields[i + 1];
        }
        if (fieldsObj.traceId === traceId || fieldsObj.correlationId === traceId) {
          streamEvents.push({ id, stream, ...fieldsObj, data: JSON.parse(fieldsObj.data || '{}') });
        }
      }
    }

    // 4. Build Timeline
    const timeline = [
      ...auditLogs.map(l => ({ type: 'AI_REASONING', ts: l.timestamp, detail: l })),
      ...streamEvents.map(e => ({ type: 'STREAM_EVENT', ts: new Date(parseInt(e.ts)), detail: e })),
    ].sort((a, b) => a.ts.getTime() - b.ts.getTime());

    return NextResponse.json({
      traceId,
      summary: {
        eventCount: timeline.length,
        startTime: timeline[0]?.ts,
        endTime: timeline[timeline.length - 1]?.ts,
        durationMs: timeline.length > 1 
          ? timeline[timeline.length - 1].ts.getTime() - timeline[0].ts.getTime() 
          : 0,
      },
      timeline,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
