import { logger } from '../../../lib/logger';

export class PromptOptimizer {
  /**
   * Intelligently compresses a prompt or evidence array to fit within token limits
   * and reduce external API costs, prioritizing the most relevant chunks.
   */
  compressEvidence(evidenceChunks: any[], maxChunks: number = 5): any[] {
    logger.info('PromptOptimizer', `Compressing evidence from ${evidenceChunks.length} down to ${maxChunks}`);
    
    // Deduplicate based on exact text or very high similarity
    const uniqueChunks: any[] = [];
    const seenTexts = new Set<string>();

    for (const chunk of evidenceChunks) {
      // Create a normalized signature to detect duplicates (e.g. same sentence extracted twice)
      const signature = chunk.text ? chunk.text.slice(0, 100).toLowerCase().trim() : '';
      if (!seenTexts.has(signature)) {
        seenTexts.add(signature);
        uniqueChunks.push(chunk);
      }
    }

    // Sort by similarity score if available (highest first)
    uniqueChunks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    // Slice to the maximum allowed chunks to save context window tokens
    return uniqueChunks.slice(0, maxChunks);
  }

  /**
   * Cleans up raw text, removing extraneous whitespace, boilerplate headers, 
   * or repetitive disclaimers to optimize token usage.
   */
  compressText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
      .replace(/\s{2,}/g, ' ')    // Remove excessive spaces
      .replace(/Safe Harbor Statement.*/i, '[Safe Harbor Removed]') // Strip boilerplate
      .trim();
  }
}

export const promptOptimizer = new PromptOptimizer();
