import { aiOrchestrator } from '../ai-orchestrator/orchestrator';
import { logger } from '../../lib/logger';

export type CopilotIntent = 
  | 'COMPANY_ANALYSIS' 
  | 'MANAGEMENT_COMMENTARY' 
  | 'MARKET_REGIME' 
  | 'SECTOR_ROTATION' 
  | 'TECHNICAL_SETUP'
  | 'RISK_ANALYSIS'
  | 'UNKNOWN';

export class IntentRouter {
  /**
   * Fast classification of user query to determine the required evidence pipeline.
   * Uses FAST_CLASSIFICATION routing (Groq / Gemini Flash) to avoid wasting deep reasoning tokens.
   */
  async classifyIntent(query: string): Promise<{ intent: CopilotIntent; symbols: string[] }> {
    logger.info('IntentRouter', `Classifying intent for: "${query}"`);

    const systemPrompt = `You are an institutional financial intent router. 
Classify the following user query into exactly ONE of the following intents:
[COMPANY_ANALYSIS, MANAGEMENT_COMMENTARY, MARKET_REGIME, SECTOR_ROTATION, TECHNICAL_SETUP, RISK_ANALYSIS, UNKNOWN].

Also, extract any stock ticker symbols mentioned.
Respond ONLY with a valid JSON object matching this schema:
{
  "intent": "INTENT_NAME",
  "symbols": ["SYMBOL1"]
}`;

    try {
      const response = await aiOrchestrator.generate('FAST_CLASSIFICATION', {
        prompt: query,
        systemPrompt,
        temperature: 0.1,
        maxTokens: 150,
        responseFormat: 'json'
      });

      const parsed = JSON.parse(response.text);
      return {
        intent: (parsed.intent as CopilotIntent) || 'UNKNOWN',
        symbols: Array.isArray(parsed.symbols) ? parsed.symbols.map((s: string) => s.toUpperCase()) : []
      };
    } catch (error) {
      logger.error('IntentRouter', 'Failed to classify intent, falling back to UNKNOWN', error);
      return { intent: 'UNKNOWN', symbols: [] };
    }
  }
}

export const intentRouter = new IntentRouter();
