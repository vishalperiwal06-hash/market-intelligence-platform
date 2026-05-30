/**
 * DeepSeek AI Client
 * 
 * Secure backend wrapper for the DeepSeek API.
 * Includes rate limit handling, retries, and token telemetry.
 */
import { logger } from '../../lib/logger';
import { aiOrchestrator } from '../ai-orchestrator/orchestrator';

export interface AIResponse {
  content: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
}

export class DeepSeekClient {
  constructor() {}

  /**
   * Core generation function now routed through the Free-First AI Orchestrator.
   * This preserves the legacy interface but uses the new resilient routing.
   */
  async generate(prompt: string, systemPrompt: string = 'You are a professional financial analyst.', temperature = 0.2): Promise<AIResponse> {
    logger.info('DeepSeekClient (Legacy wrapper)', 'Routing generation request via AI Orchestrator');
    
    // Default to REASONING task type for backwards compatibility
    const response = await aiOrchestrator.generate('REASONING', {
      prompt,
      systemPrompt,
      temperature,
    });

    return {
      content: response.text,
      tokens: {
        prompt: response.usage?.promptTokens || 0,
        completion: response.usage?.completionTokens || 0,
        total: response.usage?.totalTokens || 0,
      },
      model: response.model,
    };
  }
}

export const aiClient = new DeepSeekClient();
