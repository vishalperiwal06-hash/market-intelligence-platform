/**
 * STATE RECONCILIATION WORKER — Phase 20
 * 
 * Periodically verifies that the "hot" state in Redis matches
 * the source of truth in PostgreSQL. Detects and heals drift.
 */
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { sectorHistory, indexSnapshots } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { eventBus, RT_CHANNELS } from '@/server/realtime/event-bus';
import { createTraceContext, createEventEnvelope } from '@/server/realtime/contracts';

export class StateReconciler {
  private isRunning = false;

  async reconcile(): Promise<void> {
    logger.info('Reconciler', 'Starting state reconciliation cycle');
    const trace = createTraceContext('StateReconciler');

    try {
      // 1. Reconcile Sector Rotation
      await this.reconcileSectors(trace);

      // 2. Reconcile Index Snapshots
      await this.reconcileIndices(trace);

      logger.info('Reconciler', 'State reconciliation cycle complete');
    } catch (err) {
      logger.error('Reconciler', 'Reconciliation failed', err);
    }
  }

  private async reconcileSectors(trace: any): Promise<void> {
    const latestDB = await db.select().from(sectorHistory).orderBy(desc(sectorHistory.timestamp)).limit(50);
    const cached = await redis.get('market:sector_rotation');

    if (!cached || JSON.stringify(latestDB) !== cached) {
      logger.warn('Reconciler', 'Drift detected in sector_rotation cache. Healing...');
      await redis.set('market:sector_rotation', JSON.stringify(latestDB), 'EX', 3600);
      
      const envelope = createEventEnvelope('market:sectors:reconciled', latestDB, trace);
      await eventBus.publish(RT_CHANNELS.MARKET_SECTORS, envelope);
    }
  }

  private async reconcileIndices(trace: any): Promise<void> {
    // Check for drift in major indices
    // Mapping internal symbols to schema index names
    const majorIndices = [
      { symbol: '^NSEI', name: 'NIFTY50' },
      { symbol: '^NSEBANK', name: 'BANKNIFTY' },
      { symbol: '^BSESN', name: 'SENSEX' }
    ];

    for (const item of majorIndices) {
      const latestSnapshot = await db.select()
        .from(indexSnapshots)
        .where(eq(indexSnapshots.indexName, item.name))
        .orderBy(desc(indexSnapshots.timestamp))
        .limit(1);

      if (latestSnapshot.length > 0) {
        const row = latestSnapshot[0];
        const cacheKey = `index:latest:${item.symbol}`;
        const cached = await redis.get(cacheKey);

        if (!cached || JSON.parse(cached).price !== row.value) {
          logger.warn('Reconciler', `Drift detected in index ${item.name}. Healing...`);
          // Normalized object for the frontend
          const normalized = { 
            symbol: item.symbol, 
            price: row.value, 
            change: row.change, 
            changePercent: row.changePercent,
            timestamp: row.timestamp 
          };
          await redis.set(cacheKey, JSON.stringify(normalized), 'EX', 3600);
          
          const envelope = createEventEnvelope('market:index:reconciled', normalized, trace);
          await eventBus.publish(RT_CHANNELS.MARKET_INDICES, envelope);
        }
      }
    }
  }

  start(intervalMs: number = 300_000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    setInterval(() => this.reconcile(), intervalMs);
  }
}

export const stateReconciler = new StateReconciler();
