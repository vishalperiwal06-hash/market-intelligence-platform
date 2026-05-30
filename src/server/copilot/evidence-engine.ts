import { semanticRetrievalEngine } from '../semantic-engine/retrieval-engine';
import { marketContextGenerator } from '../market-context-engine/context-generator';
import { logger } from '../../lib/logger';
import { CopilotIntent } from './intent-router';

export interface CopilotEvidencePackage {
  marketContext: any;
  semanticEvidence: any[];
  knowledgeGraphContext: any[];
  technicalSignals: any[];
  institutionalFlows?: {
    fiiDiiToday: any[];
    recentDeals: { bulk: any[]; block: any[] };
  };
}

export class EvidenceEngine {
  /**
   * Assembles the multi-modal evidence package required for the AI to reason
   * without hallucinating.
   */
  async packageEvidence(query: string, intent: CopilotIntent, symbols: string[]): Promise<CopilotEvidencePackage> {
    logger.info('EvidenceEngine', `Packaging evidence for intent: ${intent}`);

    // 1. Always grab the overarching macro reality
    const marketContext = await marketContextGenerator.generateUnifiedContext();

    // 2. Fetch Vector Semantic Matches
    let semanticEvidence: any[] = [];
    if (intent === 'MANAGEMENT_COMMENTARY' || intent === 'COMPANY_ANALYSIS' || intent === 'RISK_ANALYSIS' || symbols.length > 0) {
       // Filter by symbol if available
       const symbolFilter = symbols.length > 0 ? symbols[0] : undefined;
       semanticEvidence = await semanticRetrievalEngine.search(query, 8, 0.3, symbolFilter ? { symbol: symbolFilter } : undefined);
    }

    // 3. Fetch Knowledge Graph & Relationships (Mocked here for architectural flow)
    let knowledgeGraphContext: any[] = [];
    if (intent === 'SECTOR_ROTATION' || intent === 'COMPANY_ANALYSIS') {
        // In a full implementation, this would query the DB for related themes and peers.
        knowledgeGraphContext = symbols.map(sym => ({
            entity: sym,
            relationships: "Requires full KG DB join implementation"
        }));
    }

    // 4. Fetch real-time FII/DII flows and Bulk/Block deals for RAG context
    let institutionalFlows = undefined;
    try {
      const { nseDataService } = await import('../nse/nselib-service');
      const fiiDiiData = await nseDataService.fiiDii();
      const dealsData = await nseDataService.deals();
      institutionalFlows = {
        fiiDiiToday: fiiDiiData.slice(0, 10),
        recentDeals: {
          bulk: (dealsData?.bulk || []).slice(0, 10),
          block: (dealsData?.block || []).slice(0, 10)
        }
      };
    } catch (err) {
      logger.warn('EvidenceEngine', 'Failed to retrieve institutional flows for RAG context');
    }

    return {
      marketContext: {
        regime: marketContext?.regime?.type || 'UNKNOWN',
        breadth: (marketContext?.breadth?.advances || 0) > (marketContext?.breadth?.declines || 0) ? 'POSITIVE' : 'NEGATIVE',
        leadership: marketContext?.leadership?.trueLeaders?.slice(0, 3) || []
      },
      semanticEvidence: semanticEvidence.map(s => ({
         source: s.sourceType,
         date: s.documentDate,
         symbol: s.symbol,
         text: s.text,
         similarity: s.similarityScore
      })),
      knowledgeGraphContext,
      technicalSignals: [], // Populated by scanner engines
      institutionalFlows
    };
  }
}

export const evidenceEngine = new EvidenceEngine();
