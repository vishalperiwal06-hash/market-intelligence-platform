/**
 * AI PROVIDER HEALTH SCORER — Phase 19
 *
 * Scores AI providers based on real observed behavior:
 * - Latency (exponential weighted moving average)
 * - Failure rate (sliding window)
 * - Token cost (free=100, paid=penalized)
 * - Availability (circuit breaker state)
 *
 * The AIOrchestrator uses these scores to dynamically
 * route tasks to the fastest, cheapest, most reliable provider.
 *
 * This replaces the static routing table with adaptive selection.
 */
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';

interface ProviderScore {
  provider: string;
  score: number;           // 0-100, higher = better
  latencyAvgMs: number;
  failureRate: number;     // 0.0 - 1.0
  costPenalty: number;     // 0 = free, higher = more expensive
  isAvailable: boolean;
  lastUpdated: number;
}

// Cost penalties (higher = more expensive, penalized in scoring)
const COST_PENALTIES: Record<string, number> = {
  'Ollama':     0,    // Free, local
  'Groq':       5,    // Free tier
  'Gemini':     5,    // Free tier
  'OpenRouter': 10,   // Free models only
  'DeepSeek':   30,   // Paid, heavily penalized
};

// Scoring weights
const WEIGHTS = {
  latency: 0.30,     // 30% weight on speed
  reliability: 0.35, // 35% weight on success rate
  cost: 0.25,        // 25% weight on cost
  locality: 0.10,    // 10% weight on local preference
};

export class ProviderHealthScorer {
  /**
   * Get scored and ranked providers for a given task.
   * Returns providers sorted by score (highest first).
   */
  async getScores(): Promise<ProviderScore[]> {
    const providers = ['Ollama', 'Groq', 'Gemini', 'OpenRouter', 'DeepSeek'];
    const scores: ProviderScore[] = [];

    const dateStr = new Date().toISOString().split('T')[0];

    // Pipeline all Redis reads
    const pipe = redis.pipeline();
    for (const p of providers) {
      pipe.hget(`ai:metrics:${dateStr}`, `${p}:requests`);
      pipe.hget(`ai:metrics:${dateStr}`, `${p}:failures`);
      pipe.hget('ai:metrics:latency', p);
      pipe.get(`ai:cooldown:${p}`);
      pipe.get(`circuit:${p}:failures`);
    }

    const results = await pipe.exec();
    if (!results) return [];

    for (let i = 0; i < providers.length; i++) {
      const p = providers[i];
      const offset = i * 5;
      const requests = parseInt((results[offset]?.[1] as string) || '0');
      const failures = parseInt((results[offset + 1]?.[1] as string) || '0');
      const latency = parseInt((results[offset + 2]?.[1] as string) || '0');
      const isCooldown = !!(results[offset + 3]?.[1]);
      const circuitFailures = parseInt((results[offset + 4]?.[1] as string) || '0');

      const failureRate = requests > 0 ? failures / requests : 0;
      const isAvailable = !isCooldown && circuitFailures < 5;
      const costPenalty = COST_PENALTIES[p] || 50;

      // Compute normalized scores (0-100)
      const latencyScore = latency > 0
        ? Math.max(0, 100 - (latency / 50)) // 5000ms = 0 score
        : 50; // Unknown = neutral

      const reliabilityScore = requests > 0
        ? (1 - failureRate) * 100
        : 50; // Unknown = neutral

      const costScore = Math.max(0, 100 - costPenalty * 2);

      const localityScore = p === 'Ollama' ? 100 : 0;

      const totalScore = isAvailable
        ? (
            latencyScore * WEIGHTS.latency +
            reliabilityScore * WEIGHTS.reliability +
            costScore * WEIGHTS.cost +
            localityScore * WEIGHTS.locality
          )
        : 0; // Unavailable providers score 0

      scores.push({
        provider: p,
        score: Math.round(totalScore),
        latencyAvgMs: latency,
        failureRate: Math.round(failureRate * 100) / 100,
        costPenalty,
        isAvailable,
        lastUpdated: Date.now(),
      });
    }

    // Sort by score descending
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Get the optimal provider ordering for a task type.
   * Returns provider names sorted by health score.
   */
  async getOptimalOrder(): Promise<string[]> {
    const scores = await this.getScores();
    return scores
      .filter(s => s.isAvailable)
      .map(s => s.provider);
  }

  /**
   * Perform a health check on Ollama (primary local inference).
   * Returns true if Ollama is responsive.
   */
  async checkOllamaHealth(): Promise<boolean> {
    try {
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const models = data.models?.map((m: any) => m.name) || [];
        await redis.set('ollama:health', JSON.stringify({
          status: 'healthy',
          models,
          timestamp: Date.now(),
        }), 'EX', 60);
        return true;
      }
      return false;
    } catch {
      await redis.set('ollama:health', JSON.stringify({
        status: 'unreachable',
        models: [],
        timestamp: Date.now(),
      }), 'EX', 60);
      return false;
    }
  }
}

export const providerScorer = new ProviderHealthScorer();
