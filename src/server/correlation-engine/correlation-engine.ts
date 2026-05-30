import { aiOrchestrator } from '../ai-orchestrator/orchestrator';
import { logger } from '../../lib/logger';

export interface CorrelatedEvent {
  primaryEvent: string; // e.g., 'EARNINGS_BEAT'
  secondaryEvent: string; // e.g., 'UNUSUAL_VOLUME'
  symbol: string;
  confidenceScore: number;
  chainDescription: string;
}

export class CorrelationEngine {
  /**
   * Detects cascading events across different domains.
   * Uses FAST_CLASSIFICATION (Local Ollama / Groq) to look for logical links
   * between recent news/filings and technical signals.
   */
  async detectCorrelations(symbol: string, recentNews: string[], recentSignals: string[]): Promise<CorrelatedEvent | null> {
    logger.info('CorrelationEngine', `Detecting cross-domain correlations for ${symbol}`);

    if (recentNews.length === 0 || recentSignals.length === 0) return null;

    const systemPrompt = `You are a financial correlation engine.
Analyze the provided NEWS and TECHNICAL SIGNALS.
Determine if there is a logical cause-and-effect relationship between them.
For example, if news is "Strong Q3 Results" and the signal is "Volume Breakout", they are highly correlated.

Respond ONLY with valid JSON:
{
  "isCorrelated": boolean,
  "confidenceScore": 0.0 to 1.0,
  "chainDescription": "Short explanation of the cause and effect"
}`;

    const prompt = `NEWS:\n${recentNews.join('\n')}\n\nSIGNALS:\n${recentSignals.join('\n')}`;

    try {
      const response = await aiOrchestrator.generate('FAST_CLASSIFICATION', {
        prompt,
        systemPrompt,
        temperature: 0.1,
        maxTokens: 150,
        responseFormat: 'json'
      });

      const parsed = JSON.parse(response.text);

      if (parsed.isCorrelated && parsed.confidenceScore > 0.6) {
        return {
          primaryEvent: 'NEWS_CATALYST',
          secondaryEvent: 'TECHNICAL_SIGNAL',
          symbol,
          confidenceScore: parsed.confidenceScore,
          chainDescription: parsed.chainDescription
        };
      }

      return null;
    } catch (error) {
      logger.error('CorrelationEngine', 'Failed to detect correlations', error);
      return null;
    }
  }
}

export const correlationEngine = new CorrelationEngine();
