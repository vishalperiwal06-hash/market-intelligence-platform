import { BaseAIProvider, AIGenerationRequest, AIGenerationResponse, AIEmbeddingRequest, AIEmbeddingResponse } from './base';
import { logger } from '../../../lib/logger';

export class DeepSeekProvider extends BaseAIProvider {
  constructor() {
    super('DeepSeek', false, {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: 'https://api.deepseek.com/v1',
    });
  }

  async generate(req: AIGenerationRequest): Promise<AIGenerationResponse> {
    const startTime = Date.now();
    if (!this.options.apiKey) throw new Error('DeepSeek API key not configured');

    const messages = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }
    messages.push({ role: 'user', content: req.prompt });

    const response = await this.fetchWithTimeout(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: req.model || 'deepseek-chat',
        messages,
        temperature: req.temperature ?? 0.1,
        max_tokens: req.maxTokens ?? 2000,
        response_format: req.responseFormat === 'json' ? { type: 'json_object' } : undefined
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      text: data.choices[0].message.content,
      model: data.model,
      provider: this.name,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      durationMs: Date.now() - startTime
    };
  }

  async embed(req: AIEmbeddingRequest): Promise<AIEmbeddingResponse> {
    throw new Error('DeepSeek does not provide embedding models directly. Use BGE/Nomic.');
  }

  async healthCheck(): Promise<boolean> {
    if (!this.options.apiKey) return false;
    try {
      // Fast minimal check
      await this.generate({ prompt: 'ping', maxTokens: 1 });
      return true;
    } catch {
      return false;
    }
  }
}

export const deepSeekProvider = new DeepSeekProvider();
