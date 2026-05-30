import { logger } from '../../lib/logger';

export interface SemanticChunk {
  index: number;
  type: 'MANAGEMENT_DISCUSSION' | 'RISK_FACTOR' | 'CAPEX' | 'HIGHLIGHTS' | 'THEMATIC' | 'UNKNOWN';
  text: string;
  tokenCount: number;
}

export class ChunkingEngine {
  /**
   * Intelligently chunks a large document (like an earnings transcript or annual report)
   * based on semantic boundaries rather than arbitrary character limits.
   */
  chunkDocument(text: string): SemanticChunk[] {
    logger.info('ChunkingEngine', `Chunking document of length ${text.length}`);
    const chunks: SemanticChunk[] = [];
    
    // Very basic paragraph-based chunking for demonstration.
    // Production systems use NLP libraries (e.g., natural, compromise) or LLM-assisted
    // semantic boundary detection to prevent cutting sentences in half.
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    
    paragraphs.forEach((p, index) => {
      chunks.push({
        index,
        type: this.classifyChunkType(p),
        text: p.trim(),
        tokenCount: Math.ceil(p.length / 4), // Rough estimate: 1 token = ~4 chars
      });
    });

    return chunks;
  }

  /**
   * Uses keyword heuristics to assign a chunk type.
   * Helps in metadata filtering during hybrid search.
   */
  private classifyChunkType(text: string): SemanticChunk['type'] {
    const lower = text.toLowerCase();
    
    if (lower.includes('capex') || lower.includes('capital expenditure') || lower.includes('investment plan')) {
      return 'CAPEX';
    }
    if (lower.includes('risk') || lower.includes('headwind') || lower.includes('uncertainty')) {
      return 'RISK_FACTOR';
    }
    if (lower.includes('management believes') || lower.includes('we expect') || lower.includes('guidance')) {
      return 'MANAGEMENT_DISCUSSION';
    }
    if (lower.includes('revenue grew') || lower.includes('margins improved') || lower.includes('ebitda')) {
      return 'HIGHLIGHTS';
    }
    if (lower.includes('ai') || lower.includes('electric vehicle') || lower.includes('defense') || lower.includes('semiconductor')) {
      return 'THEMATIC';
    }
    
    return 'UNKNOWN';
  }
}

export const chunkingEngine = new ChunkingEngine();
