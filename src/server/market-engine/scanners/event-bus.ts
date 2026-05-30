/**
 * Market Event Bus
 *
 * Internal pub/sub architecture for the scanner engine.
 * Emits and persists market events (signals, breakouts, volume spikes).
 */
import { redis } from '../../../lib/redis';
import { logger } from '../../../lib/logger';
import Redis from 'ioredis';
import { getRedisUrl } from '../../../lib/runtime-env';

export type EventType =
  | 'signal:new'
  | 'signal:expired'
  | 'ranking:updated'
  | 'alert:priority'
  | 'corporate:filing'
  | 'corporate:news'
  | 'corporate:parsed';

export interface MarketEvent {
  id: string;
  type: EventType;
  timestamp: number;
  payload: any;
}

export class EventBus {
  private publisher: Redis;
  private subscriber: Redis;
  private handlers = new Map<EventType, Array<(event: MarketEvent) => void>>();

  constructor() {
    // We use dedicated connections for pub/sub to avoid blocking the main client
    this.publisher = new Redis(getRedisUrl(), {
      lazyConnect: process.env.NEXT_PHASE === 'phase-production-build',
      maxRetriesPerRequest: 2,
    });
    this.subscriber = new Redis(getRedisUrl(), {
      lazyConnect: process.env.NEXT_PHASE === 'phase-production-build',
      maxRetriesPerRequest: 2,
    });

    this.publisher.on('error', (error) => {
      logger.warn('EventBus', 'Publisher Redis error', { error: error.message });
    });

    this.subscriber.on('error', (error) => {
      logger.warn('EventBus', 'Subscriber Redis error', { error: error.message });
    });
    
    this.subscriber.on('message', (channel, message) => {
      try {
        const event = JSON.parse(message) as MarketEvent;
        this.dispatch(event);
      } catch (e) {
        logger.error('EventBus', 'Failed to parse incoming event', e);
      }
    });
  }

  async subscribe(type: EventType, handler: (event: MarketEvent) => void) {
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
      await this.subscriber.subscribe(`events:${type}`);
    }
    this.handlers.get(type)!.push(handler);
  }

  async publish(type: EventType, payload: any) {
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    const event: MarketEvent = {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      payload,
    };
    
    await this.publisher.publish(`events:${type}`, JSON.stringify(event));
    
    // Also push to a sorted set for recent event history (keep last 1000)
    await this.publisher.zadd('market:recent_events', event.timestamp, JSON.stringify(event));
    await this.publisher.zremrangebyrank('market:recent_events', 0, -1001);
  }

  private dispatch(event: MarketEvent) {
    const callbacks = this.handlers.get(event.type) || [];
    for (const cb of callbacks) {
      try {
        cb(event);
      } catch (e) {
        logger.error('EventBus', `Handler failed for event ${event.type}`, e);
      }
    }
  }
}

export const eventBus = new EventBus();
