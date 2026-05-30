import { BaseAIProvider, AIGenerationRequest, AIGenerationResponse, AIEmbeddingRequest, AIEmbeddingResponse } from './base';
import { logger } from '../../../lib/logger';

export class OllamaProvider extends BaseAIProvider {
  constructor() {
    super('Ollama', true, {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    });
  }

  async generate(req: AIGenerationRequest): Promise<AIGenerationResponse> {
    const startTime = Date.now();
    
    let prompt = req.prompt;
    if (req.systemPrompt) {
      prompt = `System: ${req.systemPrompt}\n\nUser: ${req.prompt}`;
    }

    const response = await this.fetchWithTimeout(`${this.options.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model || 'llama3',
        prompt,
        stream: false,
        options: {
          temperature: req.temperature ?? 0.1,
          num_predict: req.maxTokens ?? 2000,
        },
        format: req.responseFormat === 'json' ? 'json' : undefined
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      text: data.response,
      model: data.model,
      provider: this.name,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      durationMs: Date.now() - startTime
    };
  }

  async embed(req: AIEmbeddingRequest): Promise<AIEmbeddingResponse> {
    const startTime = Date.now();
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const embeddings: number[][] = [];

    // Ollama embeddings endpoint generally takes one prompt at a time
    for (const text of inputs) {
      const response = await this.fetchWithTimeout(`${this.options.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: req.model || 'nomic-embed-text',
          prompt: text,
        })
      });

      if (!response.ok) throw new Error(`Ollama Embedding error: ${response.statusText}`);
      const data = await response.json();
      embeddings.push(data.embedding);
    }

    return {
      embeddings,
      model: req.model || 'nomic-embed-text',
      provider: this.name,
      durationMs: Date.now() - startTime
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.options.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const ollamaProvider = new OllamaProvider();
