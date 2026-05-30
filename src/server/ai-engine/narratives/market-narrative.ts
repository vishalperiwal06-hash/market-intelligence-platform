/**
 * Market Narrative Engine
 * 
 * Generates regular (e.g., hourly) market narratives by summarizing
 * the top gainers, volume leaders, and momentum signals.
 */
import { aiClient } from '../deepseek';
import { SYSTEM_PROMPTS, TASK_PROMPTS } from '../prompts/registry';
import { db } from '../../../lib/db';
import { aiMarketNarratives } from '../../../lib/db/schema';
import { redis } from '../../../lib/redis';
import { logger } from '../../../lib/logger';

export class MarketNarrativeEngine {
  
  async generateNarrative() {
    try {
      logger.info('MarketNarrativeEngine', 'Generating new market narrative');

      // 1. Fetch current leaderboards from Redis
      const [gainers, volumeLeaders, momentumLeaders] = await Promise.all([
        redis.zrevrange('market:gainers', 0, 9, 'WITHSCORES'),
        redis.zrevrange('market:volume_leaders', 0, 9, 'WITHSCORES'),
        redis.get('ranking:momentum_leaders')
      ]);

      const gainersMap = this.parseZSet(gainers);
      const volumeMap = this.parseZSet(volumeLeaders);

      // 2. Format
      const prompt = TASK_PROMPTS.MARKET_NARRATIVE(
        JSON.stringify(gainersMap),
        JSON.stringify(volumeMap),
        momentumLeaders || '[]'
      );

      // 3. Generate
      const response = await aiClient.generate(prompt, SYSTEM_PROMPTS.INSTITUTIONAL_ANALYST);

      const record = {
        narrativeType: 'intraday',
        content: response.content,
        sentimentScore: 0, // Would require a separate Sentiment model or structured output
        modelUsed: response.model,
        tokensUsed: response.tokens.total,
      };

      // 4. Save to DB
      const [inserted] = await db.insert(aiMarketNarratives).values(record).returning();

      // 5. Cache as latest narrative
      await redis.set('ai:narrative:latest', JSON.stringify(inserted));
      
      // 6. Pub/Sub
      await redis.publish('ai:stream:narrative', JSON.stringify(inserted));

      return inserted;
    } catch (error) {
      logger.error('MarketNarrativeEngine', 'Failed to generate narrative', error);
      throw error;
    }
  }

  private parseZSet(zset: string[]) {
    const res: Record<string, string> = {};
    for (let i = 0; i < zset.length; i += 2) {
      res[zset[i]] = zset[i + 1];
    }
    return res;
  }
}

export const marketNarrativeEngine = new MarketNarrativeEngine();
