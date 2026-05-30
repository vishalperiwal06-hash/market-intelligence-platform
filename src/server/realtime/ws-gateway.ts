import { Server as SocketIOServer, Socket } from 'socket.io';
import Redis from 'ioredis';
import { RT_CHANNELS } from '../realtime/event-bus';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { getRedisUrl } from '../../lib/runtime-env';

interface GatewayMetrics {
  totalConnections: number;
  activeConnections: number;
  messagesDelivered: number;
  eventsReceived: number;
  reconnectStorms: number;
  evictedClients: number;
}

const BROADCAST_INTERVAL_MS = 250;
const HEARTBEAT_INTERVAL_MS = 15_000;
const STALE_CLIENT_MS = 60_000;
const MAX_ROOMS_PER_CLIENT = 50;
const RECONNECT_STORM_WINDOW_MS = 5000;
const RECONNECT_STORM_THRESHOLD = 20;

const LEGACY_CHANNELS = [
  'market:stream:batch',
  'market:stream:indices',
  'market:stream:breadth',
  'market:stream:sectors',
  'corporate:filings',
];

export class WebSocketGateway {
  private io: SocketIOServer;
  private subscriber: Redis;
  private metrics: GatewayMetrics;
  private lastPong: Map<string, number> = new Map();
  private connectTimestamps: number[] = [];
  private broadcastBuffers: Map<string, any[]> = new Map();
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private staleClientTimer: ReturnType<typeof setInterval> | null = null;
  private metricsTimer: ReturnType<typeof setInterval> | null = null;

  constructor(server: any) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
      },
      perMessageDeflate: {
        threshold: 1024,
      },
      transports: ['websocket', 'polling'],
      pingInterval: HEARTBEAT_INTERVAL_MS,
      pingTimeout: STALE_CLIENT_MS,
      maxHttpBufferSize: 2 * 1024 * 1024,
      connectTimeout: 10_000,
    });

    this.subscriber = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      messagesDelivered: 0,
      eventsReceived: 0,
      reconnectStorms: 0,
      evictedClients: 0,
    };
  }

  start(): void {
    this.setupSocketHandlers();
    this.setupRedisSubscriptions();
    this.startBroadcastLoop();
    this.startStaleClientEviction();
    this.startMetricsPublisher();

    logger.info('WebSocketGateway', 'Gateway started with symbol rooms, batching, compression and Redis PubSub');
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
      this.lastPong.set(socket.id, Date.now());
      this.detectReconnectStorm();

      logger.debug('WebSocketGateway', `Client connected: ${socket.id}`, {
        active: this.metrics.activeConnections,
      });

      socket.on('subscribe', (rooms: unknown) => {
        if (!Array.isArray(rooms)) return;
        const validRooms = rooms
          .filter((room): room is string => typeof room === 'string' && room.length < 100)
          .map(room => this.normalizeRoom(room))
          .slice(0, MAX_ROOMS_PER_CLIENT);

        validRooms.forEach(room => socket.join(room));
        socket.emit('subscribed', validRooms);
      });

      socket.on('unsubscribe', (rooms: unknown) => {
        if (!Array.isArray(rooms)) return;
        rooms
          .filter((room): room is string => typeof room === 'string')
          .map(room => this.normalizeRoom(room))
          .forEach(room => socket.leave(room));
      });

      socket.on('pong', () => {
        this.lastPong.set(socket.id, Date.now());
      });

      socket.on('disconnect', () => {
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
        this.lastPong.delete(socket.id);
        logger.debug('WebSocketGateway', `Client disconnected: ${socket.id}`, {
          active: this.metrics.activeConnections,
        });
      });
    });
  }

  private setupRedisSubscriptions(): void {
    const channels = [...Object.values(RT_CHANNELS), ...LEGACY_CHANNELS];

    this.subscriber.subscribe(...channels, (err, count) => {
      if (err) {
        logger.error('WebSocketGateway', 'Failed to subscribe to Redis channels', err);
        return;
      }
      logger.info('WebSocketGateway', `Subscribed to ${count} Redis channels`);
    });

    this.subscriber.on('message', (channel: string, message: string) => {
      this.metrics.eventsReceived++;

      try {
        const data = JSON.parse(message);
        if (!this.broadcastBuffers.has(channel)) {
          this.broadcastBuffers.set(channel, []);
        }

        const buffer = this.broadcastBuffers.get(channel)!;
        if (buffer.length < 1000) {
          buffer.push(data);
        } else {
          logger.warn('WebSocketGateway', `Dropping message due to channel backpressure: ${channel}`);
        }
      } catch {
        logger.warn('WebSocketGateway', `Malformed message on ${channel}`);
      }
    });
  }

  private startBroadcastLoop(): void {
    this.broadcastTimer = setInterval(() => {
      for (const [channel, buffer] of this.broadcastBuffers.entries()) {
        if (buffer.length === 0) continue;
        this.flushChannel(channel, buffer.splice(0, buffer.length));
      }
    }, BROADCAST_INTERVAL_MS);
  }

  private flushChannel(channel: string, buffer: any[]): void {
    const room = this.channelToRoom(channel);
    
    let eventName = channel;
    let payload: any;

    if (channel === 'market:stream:batch' || channel === RT_CHANNELS.MARKET_TICKS) {
      eventName = 'market:batch';
      payload = buffer.flat(); // Flatten the array of arrays
    } else if (channel === 'market:stream:indices' || channel === RT_CHANNELS.MARKET_INDICES) {
      eventName = 'market:indices';
      payload = buffer.flat(); // Flatten the array of arrays
    } else if (channel === 'market:stream:breadth' || channel === RT_CHANNELS.MARKET_BREADTH) {
      eventName = 'market:breadth';
      payload = buffer[buffer.length - 1]; // Pick only the latest breadth object
    } else if (channel === 'corporate:filings') {
      eventName = 'corporate:filing';
      payload = buffer.length === 1 ? buffer[0] : buffer;
    } else {
      payload = buffer.length === 1 ? buffer[0] : buffer;
    }

    this.io.to(room).emit(eventName, payload);

    for (const item of buffer.flatMap(entry => this.extractBroadcastItems(channel, entry))) {
      if (item?.symbol) {
        this.io.to(`symbol:${String(item.symbol).toUpperCase()}`).emit('market:tick', item);
      }
      if (item?.indexName || item?.index || item?.symbol) {
        const idxName = String(item.indexName || item.index || item.symbol).toUpperCase();
        this.io.to(`index:${idxName}`).emit('market:index', item);
      }
      if (item?.sector) {
        this.io.to(`sector:${String(item.sector).toUpperCase()}`).emit('market:sector', item);
      }
      if (channel === 'corporate:filings' && item?.symbol) {
        this.io.to(`symbol:${String(item.symbol).toUpperCase()}`).emit('corporate:filing', item);
      }
    }

    this.metrics.messagesDelivered += buffer.length;
  }

  private extractBroadcastItems(channel: string, item: any): any[] {
    const data = item?.data ?? item;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.ticks)) return data.ticks;
    if (Array.isArray(data?.quotes)) return data.quotes;
    if (Array.isArray(data?.data)) return data.data;
    if (channel.includes('filing')) return [data];
    return data ? [data] : [];
  }

  private channelToRoom(channel: string): string {
    switch (channel) {
      case RT_CHANNELS.MARKET_TICKS:
      case 'market:stream:batch':
        return 'global:market';
      case RT_CHANNELS.MARKET_INDICES:
      case 'market:stream:indices':
        return 'global:indices';
      case RT_CHANNELS.MARKET_BREADTH:
      case 'market:stream:breadth':
        return 'global:breadth';
      case RT_CHANNELS.MARKET_SECTORS:
      case 'market:stream:sectors':
        return 'global:sectors';
      case RT_CHANNELS.SIGNALS_NEW:
        return 'global:signals';
      case RT_CHANNELS.AI_NARRATIVE:
        return 'global:ai';
      case RT_CHANNELS.OPS_TELEMETRY:
        return 'global:ops';
      case 'corporate:filings':
        return 'global:filings';
      default:
        return 'global:all';
    }
  }

  private normalizeRoom(room: string): string {
    const trimmed = room.trim();
    if (trimmed.startsWith('symbol:')) return `symbol:${trimmed.slice(7).toUpperCase()}`;
    if (trimmed.startsWith('index:')) return `index:${trimmed.slice(6).toUpperCase()}`;
    if (trimmed.startsWith('sector:')) return `sector:${trimmed.slice(7).toUpperCase()}`;
    return trimmed;
  }

  private startStaleClientEviction(): void {
    this.staleClientTimer = setInterval(() => {
      const now = Date.now();
      for (const [socketId, lastPong] of this.lastPong.entries()) {
        if (now - lastPong > STALE_CLIENT_MS) {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            logger.info('WebSocketGateway', `Evicting stale client: ${socketId}`);
            socket.disconnect(true);
            this.metrics.evictedClients++;
          }
          this.lastPong.delete(socketId);
        }
      }
    }, STALE_CLIENT_MS / 2);
  }

  private detectReconnectStorm(): void {
    const now = Date.now();
    this.connectTimestamps.push(now);
    this.connectTimestamps = this.connectTimestamps.filter(ts => now - ts < RECONNECT_STORM_WINDOW_MS);

    if (this.connectTimestamps.length >= RECONNECT_STORM_THRESHOLD) {
      this.metrics.reconnectStorms++;
      logger.warn('WebSocketGateway', `Reconnect storm detected: ${this.connectTimestamps.length} connections`);
    }
  }

  private startMetricsPublisher(): void {
    this.metricsTimer = setInterval(async () => {
      try {
        await redis.set('ws:gateway:metrics', JSON.stringify({
          ...this.metrics,
          rooms: this.io.sockets.adapter.rooms.size,
          timestamp: Date.now(),
        }), 'EX', 30);
      } catch {
        // metrics publishing must not affect websocket delivery
      }
    }, 10_000);
  }

  getMetrics(): GatewayMetrics {
    return { ...this.metrics };
  }

  async shutdown(): Promise<void> {
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
    if (this.staleClientTimer) clearInterval(this.staleClientTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    await this.subscriber.unsubscribe();
    await this.subscriber.quit();
    this.io.close();
  }
}
