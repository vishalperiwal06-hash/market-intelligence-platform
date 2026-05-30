import { db } from '../../lib/db';
import { semanticChunks } from '../../lib/db/schema';
import { eq, lt } from 'drizzle-orm';
import { logger } from '../../lib/logger';

export class SemanticMemoryEngine {
  /**
   * Prunes stale or redundant memory chunks to optimize the vector database
   * and ensure the AI Copilot only retrieves fresh, relevant evidence.
   */
  async pruneStaleMemory(daysOld: number = 90): Promise<number> {
    logger.info('SemanticMemoryEngine', `Pruning memory older than ${daysOld} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    try {
      // In a real environment with pgvector, you might also want to delete chunks
      // with extremely low access rates or those superseded by newer filings.
      const result = await db.delete(semanticChunks)
        .where(lt(semanticChunks.createdAt, cutoffDate))
        .returning({ id: semanticChunks.id });

      logger.info('SemanticMemoryEngine', `Pruned ${result.length} stale memory chunks`);
      return result.length;
    } catch (error) {
      logger.error('SemanticMemoryEngine', 'Failed to prune memory', error);
      return 0;
    }
  }

  /**
   * Applies a confidence decay factor to older relationships or extracted guidance.
   * As information ages, the AI should rely on it less.
   */
  calculateConfidenceDecay(initialConfidence: number, eventDate: Date): number {
    const ageInDays = (new Date().getTime() - eventDate.getTime()) / (1000 * 3600 * 24);
    
    // Decay by 1% per day after 30 days
    if (ageInDays <= 30) return initialConfidence;
    
    const decayFactor = Math.max(0, 1 - ((ageInDays - 30) * 0.01));
    return initialConfidence * decayFactor;
  }
}

export const semanticMemoryEngine = new SemanticMemoryEngine();
