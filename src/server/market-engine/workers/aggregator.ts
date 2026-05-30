import { redis } from '../../../lib/redis';
import { logger } from '../../../lib/logger';
import { db } from '../../../lib/db';
import { breadthIntelligence } from '../../../lib/db/schema';
import { marketRegimeEngine } from '../../market-context-engine/regime-engine';

export class MarketAggregator {
  async calculateBreadth() {
    try {
      // In a real system, you'd scan the universe of stocks or use a maintained list.
      // We will pull the latest stats from Redis.
      const symbols = await redis.keys('market:tick:*');
      
      let advances = 0;
      let declines = 0;
      let unchanged = 0;
      
      for (const key of symbols) {
        const tickStr = await redis.hgetall(key);
        if (!tickStr || !tickStr.changePercent) continue;
        
        const change = parseFloat(tickStr.changePercent);
        if (change > 0) advances++;
        else if (change < 0) declines++;
        else unchanged++;
      }
      
      const breadth = { advances, declines, unchanged, timestamp: new Date().toISOString() };
      
      // Cache and publish
      await redis.set('market:breadth', JSON.stringify(breadth));
      await redis.publish('market:stream:breadth', JSON.stringify(breadth));
      
      logger.debug('MarketAggregator', 'Breadth calculated', breadth);

      // Save calculated breadth to PostgreSQL
      try {
        await db.insert(breadthIntelligence).values({
          indexSymbol: 'NSE_ALL',
          advances,
          declines,
          unchanged,
          newHighs52w: 0,
          newLows52w: 0,
          above20dma: 50.0,
          above50dma: 50.0,
          above200dma: 50.0,
          breadthThrustSignal: advances > declines * 1.5,
        });
      } catch (dbErr) {
        logger.error('MarketAggregator', 'Failed to save breadth intelligence to PostgreSQL', dbErr);
      }

      // Assess and persist market regime
      try {
        let vixProxy = 15.0;
        const vixTick = await redis.hgetall('market:tick:INDIAVIX');
        if (vixTick && vixTick.price) {
          const parsedVix = parseFloat(vixTick.price);
          if (!isNaN(parsedVix)) {
            vixProxy = parsedVix;
          }
        }
        
        const turnoverTrend = 1.0;
        await marketRegimeEngine.assessCurrentRegime(advances, declines, vixProxy, turnoverTrend);
      } catch (regimeErr) {
        logger.error('MarketAggregator', 'Failed to assess market regime', regimeErr);
      }

    } catch (e) {
      logger.error('MarketAggregator', 'Breadth calculation failed', e);
    }
  }

  async start(intervalMs: number = 5000) {
    logger.info('MarketAggregator', `Starting background aggregations every ${intervalMs}ms`);
    setInterval(() => {
      this.calculateBreadth();
      // Heatmap calculations would go here
    }, intervalMs);
  }
}

