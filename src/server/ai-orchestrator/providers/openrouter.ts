import { BaseAIProvider, AIGenerationRequest, AIGenerationResponse, AIEmbeddingRequest, AIEmbeddingResponse } from './base';
import { logger } from '../../../lib/logger';

export class OpenRouterProvider extends BaseAIProvider {
  constructor() {
    super('OpenRouter', false, {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: 'https://openrouter.ai/api/v1',
    });
  }

  async generate(req: AIGenerationRequest): Promise<AIGenerationResponse> {
    const startTime = Date.now();
    if (!this.options.apiKey) throw new Error('OpenRouter API key not configured');

    const messages = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }
    messages.push({ role: 'user', content: req.prompt });

    const response = await this.fetchWithTimeout(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.options.apiKey}`,
        'HTTP-Referer': 'https://aibazaar.com', // Required by OpenRouter
        'X-Title': 'AI Bazaar Terminal',
      },
      body: JSON.stringify({
        model: req.model || 'openrouter/auto', // Fallback to auto if not specified
        messages,
        temperature: req.temperature ?? 0.1,
        max_tokens: req.maxTokens ?? 2000,
        response_format: req.responseFormat === 'json' ? { type: 'json_object' } : undefined
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      text: data.choices[0].message.content,
      model: data.model,
      provider: this.name,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      durationMs: Date.now() - startTime
    };
  }

  async embed(req: AIEmbeddingRequest): Promise<AIEmbeddingResponse> {
    throw new Error('OpenRouter does not provide embeddings.');
  }

  async healthCheck(): Promise<boolean> {
    if (!this.options.apiKey) return false;
    return true; // Avoid pinging OpenRouter unnecessarily for health
  }
}

export const openRouterProvider = new OpenRouterProvider();
