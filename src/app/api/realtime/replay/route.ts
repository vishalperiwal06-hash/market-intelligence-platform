/**
 * EVENT REPLAY API — Phase 19
 *
 * GET /api/realtime/replay?stream=stream:signals&since=300000&limit=50
 *
 * Provides forensic event replay from Redis Streams.
 * Critical for debugging, auditability, AI explainability.
 */
import { NextRequest, NextResponse } from 'next/server';
import { replayEngine, RT_STREAMS } from '@/server/realtime/event-bus';

const VALID_STREAMS = Object.values(RT_STREAMS);
const MAX_LIMIT = 200;
const MAX_SINCE_MS = 3_600_000; // 1 hour max replay window

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stream = searchParams.get('stream');
  const sinceMs = Math.min(
    parseInt(searchParams.get('since') || '300000', 10),
    MAX_SINCE_MS
  );
  const limit = Math.min(
    parseInt(searchParams.get('limit') || '50', 10),
    MAX_LIMIT
  );

  if (!stream || !VALID_STREAMS.includes(stream as any)) {
    return NextResponse.json({
      error: 'Invalid stream',
      validStreams: VALID_STREAMS,
    }, { status: 400 });
  }

  try {
    const events = await replayEngine.replay(stream, sinceMs, limit);
    const info = await replayEngine.streamInfo(stream);

    return NextResponse.json({
      stream,
      count: events.length,
      sinceMs,
      streamInfo: info ? {
        length: info.length,
        firstEntry: info['first-entry'],
        lastEntry: info['last-entry'],
      } : null,
      events,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Replay failed', details: error.message },
      { status: 500 }
    );
  }
}
