/**
 * Adapter Registry
 *
 * Manages multiple data source adapters with priority-based failover.
 * Primary → Secondary → Fallback
 *
 * Usage:
 *   const registry = new AdapterRegistry();
 *   registry.register(new NSEAdapter(), 1);   // Priority 1 = highest
 *   registry.register(new BSEAdapter(), 2);
 *   registry.register(new YahooAdapter(), 3); // Fallback
 *   const adapter = await registry.getHealthyAdapter();
 */
import { MarketDataAdapter } from './base';
import { logger } from '../../../lib/logger';

interface RegisteredAdapter {
  adapter: MarketDataAdapter;
  priority: number;
  healthy: boolean;
  lastCheck: number;
}

const HEALTH_CHECK_INTERVAL = 60_000; // 1 minute

export class AdapterRegistry {
  private adapters: RegisteredAdapter[] = [];

  register(adapter: MarketDataAdapter, priority: number) {
    this.adapters.push({
      adapter,
      priority,
      healthy: true, // Assume healthy until checked
      lastCheck: 0,
    });
    this.adapters.sort((a, b) => a.priority - b.priority);
    logger.info('AdapterRegistry', `Registered adapter: ${adapter.name} (priority ${priority})`);
  }

  /**
   * Returns the highest-priority healthy adapter.
   * Performs health checks if the last check is stale.
   */
  async getHealthyAdapter(): Promise<MarketDataAdapter | null> {
    const now = Date.now();

    for (const entry of this.adapters) {
      // Re-check health if stale
      if (now - entry.lastCheck > HEALTH_CHECK_INTERVAL) {
        try {
          entry.healthy = await entry.adapter.healthCheck();
          entry.lastCheck = now;
          logger.debug('AdapterRegistry', `Health check for ${entry.adapter.name}: ${entry.healthy ? 'OK' : 'FAIL'}`);
        } catch {
          entry.healthy = false;
          entry.lastCheck = now;
        }
      }

      if (entry.healthy) {
        return entry.adapter;
      }
    }

    logger.error('AdapterRegistry', 'No healthy adapters available');
    return null;
  }

  /**
   * Get status of all registered adapters.
   */
  getStatus(): Array<{ name: string; priority: number; healthy: boolean }> {
    return this.adapters.map(a => ({
      name: a.adapter.name,
      priority: a.priority,
      healthy: a.healthy,
    }));
  }

  /**
   * Force a health check on all adapters.
   */
  async checkAll(): Promise<void> {
    for (const entry of this.adapters) {
      try {
        entry.healthy = await entry.adapter.healthCheck();
        entry.lastCheck = Date.now();
      } catch {
        entry.healthy = false;
      }
      logger.info('AdapterRegistry', `${entry.adapter.name}: ${entry.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    }
  }
}
