/**
 * AI COST GOVERNOR — Phase 21
 * 
 * Enforces institutional budget controls on AI usage.
 * - Tracks token consumption in real-time.
 * - Predicts monthly burn rate.
 * - Dynamically throttles expensive providers.
 * - Automatically offloads large/costly tasks to local Ollama.
 */
import { redis } from '../../lib/redis';
import { db } from '../../lib/db';
import { aiTokenUsage } from '../../lib/db/schema';
import { logger } from '../../lib/logger';

export interface BudgetConfig {
  monthlyCapUSD: number;
  providerCapsUSD: Record<string, number>;
  expensivePromptThreshold: number; // Token count to trigger Ollama offload
}

// Estimated costs per 1k tokens (Institutional rates)
const UNIT_COSTS: Record<string, { input: number; output: number }> = {
  'DeepSeek':   { input: 0.0001, output: 0.0002 },
  'Gemini':     { input: 0.0000, output: 0.0000 }, // Free tier assumed
  'Groq':       { input: 0.0000, output: 0.0000 }, // Free tier assumed
  'OpenRouter': { input: 0.0002, output: 0.0005 },
  'Ollama':     { input: 0.0000, output: 0.0000 }, // Local = Zero cost
};

export class CostGovernor {
  private config: BudgetConfig = {
    monthlyCapUSD: 100.0,
    providerCapsUSD: {
      'DeepSeek': 50.0,
      'OpenRouter': 30.0,
    },
    expensivePromptThreshold: 2000, // Tasks > 2k tokens go to Ollama
  };

  /**
   * Records token usage and returns estimated cost.
   */
  async recordUsage(params: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    userId?: string;
  }): Promise<number> {
    const { provider, model, inputTokens, outputTokens, userId } = params;
    const rates = UNIT_COSTS[provider] || { input: 0.0005, output: 0.001 };
    
    const cost = ((inputTokens / 1000) * rates.input) + ((outputTokens / 1000) * rates.output);

    try {
      // 1. Update Redis counters (Day/Month)
      const dateStr = new Date().toISOString().split('T')[0];
      const monthStr = dateStr.substring(0, 7);

      const pipe = redis.pipeline();
      pipe.hincrbyfloat(`ai:cost:month:${monthStr}`, provider, cost);
      pipe.hincrbyfloat(`ai:cost:day:${dateStr}`, provider, cost);
      pipe.hincrby(`ai:tokens:month:${monthStr}`, `${provider}:total`, inputTokens + outputTokens);
      await pipe.exec();

      // 2. Persist to DB for detailed accounting
      await db.insert(aiTokenUsage).values({
        userId: userId ? (userId as any) : null,
        provider,
        model,
        inputTokens,
        outputTokens,
        costEstimate: cost,
      });

      return cost;
    } catch (err) {
      logger.error('CostGovernor', 'Failed to record AI usage', err);
      return cost;
    }
  }

  /**
   * Determines if a request should be offloaded to local Ollama.
   */
  async shouldOffloadToLocal(inputTokenCount: number): Promise<boolean> {
    if (inputTokenCount > this.config.expensivePromptThreshold) {
      logger.info('CostGovernor', `Offloading expensive prompt (${inputTokenCount} tokens) to local Ollama`);
      return true;
    }
    return false;
  }

  /**
   * Checks if the monthly budget has been exceeded.
   */
  async isOverBudget(provider?: string): Promise<boolean> {
    const monthStr = new Date().toISOString().substring(0, 7);
    const costs = await redis.hgetall(`ai:cost:month:${monthStr}`);
    
    const totalCost = Object.values(costs).reduce((sum, val) => sum + parseFloat(val), 0);
    if (totalCost >= this.config.monthlyCapUSD) {
      logger.warn('CostGovernor', `Global monthly budget exceeded: $${totalCost.toFixed(2)}`);
      return true;
    }

    if (provider && this.config.providerCapsUSD[provider]) {
      const providerCost = parseFloat(costs[provider] || '0');
      if (providerCost >= this.config.providerCapsUSD[provider]) {
        logger.warn('CostGovernor', `Provider budget exceeded for ${provider}: $${providerCost.toFixed(2)}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Returns a report for the dashboard.
   */
  async getBudgetReport(): Promise<any> {
    const monthStr = new Date().toISOString().substring(0, 7);
    const costs = await redis.hgetall(`ai:cost:month:${monthStr}`);
    const tokens = await redis.hgetall(`ai:tokens:month:${monthStr}`);

    return {
      month: monthStr,
      totalCost: Object.values(costs).reduce((sum, val) => sum + parseFloat(val), 0),
      config: this.config,
      providerBreakdown: costs,
      tokenBreakdown: tokens,
    };
  }
}

export const costGovernor = new CostGovernor();
