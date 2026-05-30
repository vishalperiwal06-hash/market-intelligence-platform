import { BaseAIProvider, AIGenerationRequest, AIGenerationResponse, AIEmbeddingRequest, AIEmbeddingResponse } from './base';
import { logger } from '../../../lib/logger';

export class GeminiProvider extends BaseAIProvider {
  constructor() {
    super('Gemini', false, {
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    });
  }

  async generate(req: AIGenerationRequest): Promise<AIGenerationResponse> {
    const startTime = Date.now();
    if (!this.options.apiKey) throw new Error('Gemini API key not configured');

    const modelId = req.model || 'gemini-1.5-flash';
    const url = `${this.options.baseUrl}/${modelId}:generateContent?key=${this.options.apiKey}`;

    const body: any = {
      contents: [{ parts: [{ text: req.prompt }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.1,
        maxOutputTokens: req.maxTokens ?? 2000,
      }
    };

    if (req.systemPrompt) {
      body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
    }

    if (req.responseFormat === 'json') {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      text: data.candidates[0].content.parts[0].text,
      model: modelId,
      provider: this.name,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
      durationMs: Date.now() - startTime
    };
  }

  async embed(req: AIEmbeddingRequest): Promise<AIEmbeddingResponse> {
    throw new Error('Gemini embed not fully implemented yet.');
  }

  async healthCheck(): Promise<boolean> {
    if (!this.options.apiKey) return false;
    try {
      await this.generate({ prompt: 'hi', maxTokens: 1 });
      return true;
    } catch {
      return false;
    }
  }
}

export const geminiProvider = new GeminiProvider();
