/**
 * useRealtimeStream — Phase 19 SSE Client Hook
 *
 * Replaces ALL setInterval polling loops with a single
 * EventSource connection to /api/realtime/stream.
 *
 * Architecture:
 *   - Single SSE connection per browser tab
 *   - Automatic reconnect with exponential backoff
 *   - Channel-level event dispatch via callbacks
 *   - Stale detection (warns UI if no events in 30s)
 *   - Memory-safe: cleans up on unmount
 *   - Fallback: components can still poll if SSE fails
 *
 * Usage:
 *   const { connected, stale } = useRealtimeStream({
 *     onMarketTicks: (data) => updateMarketState(data),
 *     onSignals: (data) => addNewSignal(data),
 *   });
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Channel names must match server-side RT_CHANNELS
const CHANNELS = {
  MARKET_TICKS:   'rt:market:ticks',
  MARKET_INDICES: 'rt:market:indices',
  MARKET_BREADTH: 'rt:market:breadth',
  MARKET_SECTORS: 'rt:market:sectors',
  SIGNALS_NEW:    'rt:signals:new',
  AI_NARRATIVE:   'rt:ai:narrative',
  OPS_TELEMETRY:  'rt:ops:telemetry',
} as const;

export interface RealtimeHandlers {
  onMarketTicks?:   (data: any) => void;
  onMarketIndices?: (data: any) => void;
  onMarketBreadth?: (data: any) => void;
  onMarketSectors?: (data: any) => void;
  onSignals?:       (data: any) => void;
  onAINarrative?:   (data: any) => void;
  onOpsTelemetry?:  (data: any) => void;
  onRawEvent?:      (channel: string, data: any) => void;
}

interface RealtimeState {
  connected: boolean;
  stale: boolean;
  reconnectCount: number;
  lastEventAt: number | null;
}

const STALE_THRESHOLD_MS = 30_000; // No events in 30s = stale warning
const MAX_RECONNECT_DELAY_MS = 30_000;

export function useRealtimeStream(
  handlers: RealtimeHandlers,
  channels?: string[]
): RealtimeState {
  const [state, setState] = useState<RealtimeState>({
    connected: false,
    stale: false,
    reconnectCount: 0,
    lastEventAt: null,
  });

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const reconnectCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventAtRef = useRef<number>(Date.now());

  const connect = useCallback(() => {
    // Build URL with optional channel filter
    const params = channels ? `?channels=${channels.join(',')}` : '';
    const url = `/api/realtime/stream${params}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('connected', (e) => {
      reconnectCountRef.current = 0;
      setState(prev => ({ ...prev, connected: true, stale: false, reconnectCount: 0 }));
    });

    // Route each channel event to the appropriate handler
    const channelHandlerMap: Record<string, (data: any) => void> = {
      [CHANNELS.MARKET_TICKS]:   (d) => handlersRef.current.onMarketTicks?.(d),
      [CHANNELS.MARKET_INDICES]: (d) => handlersRef.current.onMarketIndices?.(d),
      [CHANNELS.MARKET_BREADTH]: (d) => handlersRef.current.onMarketBreadth?.(d),
      [CHANNELS.MARKET_SECTORS]: (d) => handlersRef.current.onMarketSectors?.(d),
      [CHANNELS.SIGNALS_NEW]:    (d) => handlersRef.current.onSignals?.(d),
      [CHANNELS.AI_NARRATIVE]:   (d) => handlersRef.current.onAINarrative?.(d),
      [CHANNELS.OPS_TELEMETRY]:  (d) => handlersRef.current.onOpsTelemetry?.(d),
    };

    for (const [channel, handler] of Object.entries(channelHandlerMap)) {
      es.addEventListener(channel, (e: MessageEvent) => {
        lastEventAtRef.current = Date.now();
        setState(prev => ({ ...prev, stale: false, lastEventAt: Date.now() }));
        try {
          const parsed = JSON.parse(e.data);
          handler(parsed);
          handlersRef.current.onRawEvent?.(channel, parsed);
        } catch {
          // Malformed event — skip
        }
      });
    }

    es.onerror = () => {
      es.close();
      setState(prev => ({ ...prev, connected: false }));

      // Exponential backoff reconnect
      reconnectCountRef.current += 1;
      const delay = Math.min(
        1000 * Math.pow(2, reconnectCountRef.current - 1),
        MAX_RECONNECT_DELAY_MS
      );
      setState(prev => ({ ...prev, reconnectCount: reconnectCountRef.current }));

      setTimeout(connect, delay);
    };
  }, [channels]);

  useEffect(() => {
    connect();

    // Stale detection: check every 10s if we've received events recently
    staleTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastEventAtRef.current;
      if (elapsed > STALE_THRESHOLD_MS) {
        setState(prev => ({ ...prev, stale: true }));
      }
    }, 10_000);

    return () => {
      eventSourceRef.current?.close();
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
    };
  }, [connect]);

  return state;
}
