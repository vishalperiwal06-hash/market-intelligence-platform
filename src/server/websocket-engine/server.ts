import { Server as SocketIOServer } from 'socket.io';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import Redis from 'ioredis';
import { getRedisUrl } from '../../lib/runtime-env';

export class WebsocketEngine {
  private io: SocketIOServer;
  private subscriber: Redis;

  constructor(server: any) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*', // Adjust for production
        methods: ['GET', 'POST']
      }
    });
    
    // Create a dedicated Redis subscriber connection
    this.subscriber = new Redis(getRedisUrl());
  }

  start() {
    this.setupSocketEvents();
    this.setupRedisSubscriptions();
    logger.info('WebsocketEngine', 'Websocket server started');
  }

  private setupSocketEvents() {
    this.io.on('connection', (socket) => {
      logger.debug('WebsocketEngine', `Client connected: ${socket.id}`);

      // Allow clients to subscribe to specific rooms (e.g. watchlist, indices)
      socket.on('subscribe', (rooms: string[]) => {
        rooms.forEach(room => socket.join(room));
      });

      socket.on('unsubscribe', (rooms: string[]) => {
        rooms.forEach(room => socket.leave(room));
      });

      socket.on('disconnect', () => {
        logger.debug('WebsocketEngine', `Client disconnected: ${socket.id}`);
      });
    });
  }

  private setupRedisSubscriptions() {
    this.subscriber.subscribe('market:stream:batch', 'market:stream:indices', 'market:stream:breadth', (err, count) => {
      if (err) {
        logger.error('WebsocketEngine', 'Failed to subscribe to Redis channels', err);
        return;
      }
      logger.info('WebsocketEngine', `Subscribed to ${count} Redis channels`);
    });

    this.subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        
        if (channel === 'market:stream:batch') {
          // Broadcast to global market room
          this.io.to('global:market').emit('market:batch', data);
          
          // Broadcast to specific symbol rooms for granular subscriptions
          data.forEach((quote: any) => {
             this.io.to(`symbol:${quote.symbol}`).emit('market:tick', quote);
          });
        } 
        else if (channel === 'market:stream:indices') {
          this.io.to('global:indices').emit('market:indices', data);
        }
        else if (channel === 'market:stream:breadth') {
          this.io.to('global:breadth').emit('market:breadth', data);
        }
      } catch (error) {
        logger.error('WebsocketEngine', 'Failed to process Redis message', error);
      }
    });
  }
}
