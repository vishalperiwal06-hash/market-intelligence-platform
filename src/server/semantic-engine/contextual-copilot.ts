import { semanticRetrievalEngine } from './retrieval-engine';
import { marketContextGenerator } from '../market-context-engine/context-generator';
import { logger } from '../../lib/logger';

export class ContextualCopilotRetrieval {
  
  /**
   * Generates the ultimate evidence-backed payload for the AI Copilot.
   * Merges:
   * 1. Hard factual semantic matches from filings/news (pgvector)
   * 2. Live macro/market state (Market Context Engine)
   */
  async retrieveContext(query: string, symbolFilter?: string) {
    logger.info('ContextualCopilot', `Retrieving full AI context for query: "${query}"`);

    // 1. Get raw semantic chunks from the database
    const semanticResults = await semanticRetrievalEngine.search(
      query, 
      6, // Top 6 most relevant chunks
      0.5, 
      symbolFilter ? { symbol: symbolFilter } : undefined
    );

    // 2. Get the overarching market reality
    const marketContext = await marketContextGenerator.generateUnifiedContext();

    // 3. Package it securely for the AI
    // By structuring it this way, we force the AI to cite specific "Source Evidence"
    // and respect the "Market Reality" rather than hallucinating based on its internal weights.
    
    return {
      query,
      marketReality: {
        regime: marketContext?.regime.type,
        breadth: (marketContext?.breadth.advances || 0) > (marketContext?.breadth.declines || 0) ? 'Positive' : 'Negative',
        liquidity: marketContext?.liquidity.turnoverTrend,
      },
      sourceEvidence: semanticResults.map(res => ({
        symbol: res.symbol,
        type: res.chunkType,
        date: res.documentDate,
        source: res.sourceType,
        similarity: `${(res.similarityScore * 100).toFixed(1)}%`,
        excerpt: res.text,
      })),
      instructions: [
        "NEVER hallucinate financial metrics.",
        "IF the source evidence does not contain the answer, say 'I lack the verified documents to answer this.'",
        "ALWAYS cite the symbol and document date when referencing an excerpt.",
        "FRAME your answer within the current Market Reality provided."
      ]
    };
  }
}

export const contextualCopilot = new ContextualCopilotRetrieval();
