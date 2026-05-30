import Redis from 'ioredis';
import { logger } from '../../lib/logger';
import { getRedisUrl } from '../../lib/runtime-env';
import { EventEnvelope } from './contracts';

export const RT_CHANNELS = {
  MARKET_TICKS: 'rt:market:ticks',
  MARKET_INDICES: 'rt:market:indices',
  MARKET_BREADTH: 'rt:market:breadth',
  MARKET_SECTORS: 'rt:market:sectors',
  SIGNALS_NEW: 'rt:signals:new',
  AI_NARRATIVE: 'rt:ai:narrative',
  OPS_TELEMETRY: 'rt:ops:telemetry',
  COPILOT_STREAM: 'rt:copilot:stream',
} as const;

export type RTChannel = typeof RT_CHANNELS[keyof typeof RT_CHANNELS];

export const RT_STREAMS = {
  MARKET_TICKS: 'stream:market:ticks',
  SIGNALS: 'stream:signals',
  AI_DECISIONS: 'stream:ai:decisions',
  OPS: 'stream:ops',
} as const;

const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1MB
const STREAM_MAX_LEN = 5000;
const IS_NEXT_BUILD = process.env.NEXT_PHASE === 'phase-production-build';

function createRedisClient() {
  const client = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: true,
  });

  client.on('error', (err) => {
    logger.warn('EventBus', 'Redis error', { error: err.message });
  });

  return client;
}

class EventBusPublisher {
  private pub: Redis;

  constructor() {
    this.pub = createRedisClient();
    if (!IS_NEXT_BUILD) {
      this.pub.connect().catch(() => {
        logger.warn('EventBus', 'Publisher initial connection failed');
      });
    }
  }

  async publish(channel: RTChannel, envelope: EventEnvelope, opts?: { stream?: string }): Promise<void> {
    if (IS_NEXT_BUILD) return;

    const payload = JSON.stringify(envelope);
    if (Buffer.byteLength(payload) > MAX_PAYLOAD_BYTES) {
      logger.warn('EventBus', `Payload too large for ${channel}`, { bytes: Buffer.byteLength(payload) });
      return;
    }

    try {
      await this.pub.publish(channel, payload);
      if (opts?.stream) {
        await this.pub.xadd(
          opts.stream,
          'MAXLEN',
          '~',
          String(STREAM_MAX_LEN),
          '*',
          'type',
          envelope.type,
          'eventId',
          envelope.eventId,
          'traceId',
          envelope.trace.traceId,
          'correlationId',
          envelope.trace.correlationId,
          'data',
          JSON.stringify(envelope.data),
          'ts',
          envelope.trace.timestamp.toString(),
        );
      }
    } catch (err: any) {
      logger.warn('EventBus', `Publish failed on ${channel}`, { error: err.message });
    }
  }

  async shutdown(): Promise<void> {
    await this.pub.quit();
  }
}

export function createSubscriber(
  channels: RTChannel[],
  onMessage: (channel: string, data: string) => void,
): { subscriber: Redis; cleanup: () => Promise<void> } {
  const sub = createRedisClient();

  if (!IS_NEXT_BUILD) {
    sub.connect()
      .then(() => sub.subscribe(...channels))
      .catch((err) => {
        logger.warn('EventBus', 'Subscriber connection failed', { error: err.message });
      });
  }

  sub.on('message', (channel, message) => {
    onMessage(channel, message);
  });

  const cleanup = async () => {
    try {
      await sub.unsubscribe();
      await sub.quit();
    } catch {
      sub.disconnect();
    }
  };

  return { subscriber: sub, cleanup };
}

export class ReplayEngine {
  private reader: Redis;

  constructor() {
    this.reader = createRedisClient();
  }

  async replay(stream: string, sinceMs: number = 300_000, limit: number = 100): Promise<any[]> {
    if (IS_NEXT_BUILD) return [];
    const startId = `${Date.now() - sinceMs}-0`;
    try {
      const results = await this.reader.xrange(stream, startId, '+', 'COUNT', limit);
      return results.map(([id, fields]) => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          obj[fields[i]] = fields[i + 1];
        }
        return { id, ...obj, data: obj.data ? JSON.parse(obj.data) : null };
      });
    } catch (err: any) {
      logger.warn('ReplayEngine', `Replay failed for ${stream}`, { error: err.message });
      return [];
    }
  }

  async streamInfo(stream: string): Promise<Record<string, any> | null> {
    if (IS_NEXT_BUILD) return null;
    try {
      const info = await this.reader.xinfo('STREAM', stream) as any[];
      const parsed: Record<string, any> = {};
      for (let i = 0; i < info.length; i += 2) {
        parsed[info[i]] = info[i + 1];
      }
      return parsed;
    } catch {
      return null;
    }
  }
}

const globalForEventBus = global as unknown as { eventBus: EventBusPublisher; replayEngine: ReplayEngine };

export const eventBus = globalForEventBus.eventBus || new EventBusPublisher();
export const replayEngine = globalForEventBus.replayEngine || new ReplayEngine();

if (process.env.NODE_ENV !== 'production') {
  globalForEventBus.eventBus = eventBus;
  globalForEventBus.replayEngine = replayEngine;
}
