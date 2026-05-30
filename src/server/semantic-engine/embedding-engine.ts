import { embeddingOrchestrator } from './providers/embedding-orchestrator';

export class EmbeddingEngine {
  async generateEmbedding(text: string): Promise<number[]> {
    return embeddingOrchestrator.generateEmbedding(text);
  }
}

export const embeddingEngine = new EmbeddingEngine();

