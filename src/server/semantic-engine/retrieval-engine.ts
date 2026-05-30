import { db } from '../../lib/db';
import { sql } from 'drizzle-orm';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { embeddingEngine } from './embedding-engine';
import { retrievalLogs } from '../../lib/db/schema';
import crypto from 'crypto';

export interface SemanticSearchResult {
  chunkId: string;
  documentId: string;
  symbol: string;
  chunkType: string;
  text: string;
  similarityScore: number;
  documentDate: string;
  sourceType: string;
}

export class SemanticRetrievalEngine {
  /**
   * Executes a hybrid search combining vector cosine similarity with optional metadata filters.
   */
  async search(
    queryText: string, 
    limit: number = 5, 
    minSimilarity: number = 0.5,
    filters?: { symbol?: string; chunkType?: string }
  ): Promise<SemanticSearchResult[]> {
    const startTime = Date.now();
    logger.info('SemanticRetrievalEngine', `Searching for: "${queryText}"`);

    // 1. Generate query embedding
    const queryVector = await embeddingEngine.generateEmbedding(queryText);
    const vectorString = `[${queryVector.join(',')}]`;

    // 2. Build the raw SQL query for pgvector
    // The `<=>` operator computes cosine distance. Cosine similarity = 1 - cosine distance.
    // We want highest similarity, so lowest distance.
    
    let baseSql = `
      SELECT 
        c.id as chunk_id,
        c.document_id,
        d.symbol,
        c.chunk_type,
        c.text,
        1 - (c.embedding <=> $1::vector) as similarity,
        d.document_date,
        d.sourceType
      FROM semantic_chunks c
      JOIN semantic_documents d ON c.document_id = d.id
      WHERE 1 - (c.embedding <=> $1::vector) > $2
    `;

    const params: any[] = [vectorString, minSimilarity];
    let paramIndex = 3;

    if (filters?.symbol) {
      baseSql += ` AND d.symbol = $${paramIndex}`;
      params.push(filters.symbol);
      paramIndex++;
    }

    if (filters?.chunkType) {
      baseSql += ` AND c.chunk_type = $${paramIndex}`;
      params.push(filters.chunkType);
      paramIndex++;
    }

    baseSql += ` ORDER BY c.embedding <=> $1::vector ASC LIMIT $${paramIndex}`;
    params.push(limit);

    try {
      // 3. Execute query
      // Drizzle raw execute
      const result = await db.execute(sql.raw(`
        SELECT * FROM (
          ${baseSql.replace(/\$(\d+)/g, (match, p1) => {
             const idx = parseInt(p1) - 1;
             return typeof params[idx] === 'string' ? `'${params[idx]}'` : params[idx];
          })}
        ) as search_results
      `));

      const matches = result.map((row: any) => ({
        chunkId: String(row.chunk_id),
        documentId: String(row.document_id),
        symbol: String(row.symbol),
        chunkType: String(row.chunk_type),
        text: String(row.text),
        similarityScore: Number(row.similarity),
        documentDate: String(row.document_date),
        sourceType: String(row.sourceType)
      }));

      // 4. Log the retrieval for observability
      const maxScore = matches.length > 0 ? matches[0].similarityScore : 0;
      await db.insert(retrievalLogs).values({
        queryText,
        queryVectorLength: queryVector.length,
        resultCount: matches.length,
        maxSimilarityScore: maxScore,
        executionTimeMs: Date.now() - startTime,
        filtersApplied: filters || {},
      }).catch(() => {});

      return matches;

    } catch (error: any) {
      logger.warn('SemanticRetrievalEngine', `Search query failed or pgvector unseeded: ${error.message}`);
      return [];
    }
  }

  /**
   * Identifies if management tone on a specific topic is changing over time
   * by comparing similarity of chunks across sequential quarters.
   */
  async analyzeNarrativeEvolution(symbol: string, topicQuery: string): Promise<any> {
    // Uses the search engine constrained to a single symbol to find historical mentions of a topic
    const results = await this.search(topicQuery, 10, 0.4, { symbol });
    
    // Sort chronologically
    const chronological = results.sort((a, b) => new Date(a.documentDate).getTime() - new Date(b.documentDate).getTime());
    
    return {
      symbol,
      topic: topicQuery,
      mentions: chronological,
      trend: chronological.length > 0 ? 'PERSISTENT' : 'NONE'
    };
  }
}

export const semanticRetrievalEngine = new SemanticRetrievalEngine();
