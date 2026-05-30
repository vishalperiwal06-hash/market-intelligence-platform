/**
 * CHAOS ENGINE — Phase 20
 * 
 * Provides controlled failure simulation for testing system resilience.
 * - Provider outage simulation
 * - Redis latency injection
 * - Random worker crash simulation
 */
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';

export class ChaosEngine {
  /**
   * Simulates a provider outage by setting a long-lived cooldown in Redis.
   */
  async simulateProviderOutage(providerName: string, durationSec: number = 60): Promise<void> {
    logger.warn('ChaosEngine', `Injecting failure: Provider outage for ${providerName}`);
    await redis.set(`ai:cooldown:${providerName}`, '1', 'EX', durationSec);
    await redis.set(`circuit:${providerName}:failures`, '10', 'EX', durationSec);
  }

  /**
   * Simulates Redis latency by wrapping Redis calls (not implemented here, 
   * but can be used by higher-level orchestrators).
   */
  injectLatency(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simulates a worker crash by process.exit() with a random probability.
   * USE WITH EXTREME CAUTION.
   */
  randomCrash(probability: number = 0.01): void {
    if (Math.random() < probability) {
      logger.error('ChaosEngine', 'SIMULATED FATAL CRASH: process.exit(1)');
      process.exit(1);
    }
  }

  /**
   * Simulates a reconnect storm by forcing all current WS clients to disconnect.
   */
  async simulateReconnectStorm(io: any): Promise<void> {
    logger.warn('ChaosEngine', 'Injecting reconnect storm: Disconnecting all clients');
    io.sockets.sockets.forEach((socket: any) => {
      socket.disconnect(true);
    });
  }
}

export const chaosEngine = new ChaosEngine();
