export interface AIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface AIGenerationRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface AIGenerationResponse {
  text: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
}

export interface AIEmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface AIEmbeddingResponse {
  embeddings: number[][];
  model: string;
  provider: string;
  usage?: {
    totalTokens: number;
  };
  durationMs: number;
}

export abstract class BaseAIProvider {
  protected options: AIProviderOptions;
  public name: string;
  public isLocal: boolean;

  constructor(name: string, isLocal: boolean, options: AIProviderOptions = {}) {
    this.name = name;
    this.isLocal = isLocal;
    this.options = {
      maxRetries: 3,
      timeoutMs: 30000,
      ...options,
    };
  }

  abstract generate(req: AIGenerationRequest): Promise<AIGenerationResponse>;
  abstract embed(req: AIEmbeddingRequest): Promise<AIEmbeddingResponse>;
  abstract healthCheck(): Promise<boolean>;

  protected async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
