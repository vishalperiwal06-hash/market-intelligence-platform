/**
 * SSE GATEWAY — Phase 19
 *
 * Next.js API route providing Server-Sent Events for all realtime data.
 * Replaces 13 individual setInterval polling loops on the frontend
 * with a single persistent HTTP stream.
 *
 * Architecture:
 *   Browser <--SSE--> Next.js API Route <--Pub/Sub--> Redis <-- Workers
 *
 * Transport Properties:
 *   - Auto-reconnect (built into EventSource browser API)
 *   - Channel filtering via query params
 *   - Heartbeat every 15s to prevent proxy/LB timeouts
 *   - Bounded event batching (50ms window) to prevent render storms
 *   - Memory-safe: subscriber cleanup on disconnect
 *   - Horizontal scaling: each instance subscribes independently
 *
 * Query Params:
 *   channels — comma-separated list of channels to subscribe to
 *   Example: /api/realtime/stream?channels=rt:market:ticks,rt:signals:new
 *   Default: all channels
 */
import { NextRequest } from 'next/server';
import { createSubscriber, RT_CHANNELS, RTChannel } from '@/server/realtime/event-bus';

// All available channels
const ALL_CHANNELS = Object.values(RT_CHANNELS);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const channelParam = searchParams.get('channels');

  // Parse requested channels (or default to all)
  let channels: RTChannel[];
  if (channelParam) {
    const requested = channelParam.split(',').map(c => c.trim());
    channels = requested.filter(c => ALL_CHANNELS.includes(c as RTChannel)) as RTChannel[];
    if (channels.length === 0) channels = ALL_CHANNELS;
  } else {
    channels = ALL_CHANNELS;
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();

  // Event batching state
  let pendingEvents: string[] = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ channels, ts: Date.now() })}\n\n`));

      // Heartbeat to prevent proxy/load-balancer timeouts (every 15s)
      const heartbeat = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          // Stream closed
        }
      }, 15_000);

      // Flush batched events (50ms batching window)
      const flushBatch = () => {
        if (pendingEvents.length === 0 || isClosed) return;
        try {
          const batch = pendingEvents.join('');
          pendingEvents = [];
          controller.enqueue(encoder.encode(batch));
        } catch {
          // Stream closed
        }
        batchTimer = null;
      };

      // Subscribe to Redis channels
      const { cleanup } = createSubscriber(channels, (channel, data) => {
        if (isClosed) return;

        // Format as SSE event
        const sseEvent = `event: ${channel}\ndata: ${data}\n\n`;
        pendingEvents.push(sseEvent);

        // Batch: flush after 50ms idle window
        if (!batchTimer) {
          batchTimer = setTimeout(flushBatch, 50);
        }

        // Safety: force flush if batch grows too large (>20 events)
        if (pendingEvents.length >= 20) {
          if (batchTimer) clearTimeout(batchTimer);
          flushBatch();
        }
      });

      // Cleanup on abort (client disconnect)
      request.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(heartbeat);
        if (batchTimer) clearTimeout(batchTimer);
        cleanup().catch(() => {});
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
