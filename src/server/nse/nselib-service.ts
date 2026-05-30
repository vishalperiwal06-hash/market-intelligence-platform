import { logger } from '@/lib/logger';

export interface NseServiceResponse<T> {
  ok: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export interface NseSymbolRecord {
  symbol: string;
  name?: string | null;
  isin?: string | null;
  series?: string | null;
  sector?: string | null;
  industry?: string | null;
  instrument_type: string;
  exchange: string;
  is_fno: boolean;
  is_sme: boolean;
  is_etf: boolean;
  lot_size?: number | null;
  source: string;
}

export interface NseQuoteRecord {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  close: number;
  exchange: 'NSE' | 'BSE' | 'UNKNOWN';
  timestamp: string;
  source: string;
}

export interface NseFilingRecord {
  exchange: string;
  symbol: string;
  companyName: string;
  category: string;
  subject: string;
  details?: string | null;
  broadcastDate: string;
  receiptDate: string;
  pdfUrl?: string | null;
  attachmentName?: string | null;
  metadata?: Record<string, unknown>;
}

const DEFAULT_BASE_URL = process.env.NSE_DATA_SERVICE_URL || 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = Number(process.env.NSE_DATA_SERVICE_TIMEOUT_MS || 8000);

class NseDataServiceClient {
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.request<Record<string, unknown>>('/health');
      return response.status === 'ok' || response.status === 'degraded';
    } catch {
      return false;
    }
  }

  async universe(refresh = false): Promise<NseSymbolRecord[]> {
    const params = new URLSearchParams();
    if (refresh) params.set('refresh', 'true');
    const response = await this.request<NseServiceResponse<NseSymbolRecord[]>>(`/api/v1/universe?${params}`);
    return response.data;
  }

  async quotes(symbols: string[]): Promise<NseQuoteRecord[]> {
    if (symbols.length === 0) return [];
    const params = new URLSearchParams({ symbols: symbols.join(',') });
    const response = await this.request<NseServiceResponse<NseQuoteRecord[]>>(`/api/v1/quotes?${params}`);
    return response.data;
  }

  async indices(): Promise<NseQuoteRecord[]> {
    const response = await this.request<NseServiceResponse<NseQuoteRecord[]>>('/api/v1/indices');
    return response.data;
  }

  async filings(options: {
    symbol?: string | null;
    category?: string | null;
    limit?: number;
    offset?: number;
    search?: string | null;
  }): Promise<{ filings: NseFilingRecord[]; meta: Record<string, unknown> }> {
    const params = new URLSearchParams();
    if (options.symbol) params.set('symbol', options.symbol);
    if (options.category) params.set('category', options.category);
    if (options.search) params.set('search', options.search);
    params.set('limit', String(options.limit ?? 50));
    params.set('offset', String(options.offset ?? 0));

    const response = await this.request<NseServiceResponse<NseFilingRecord[]>>(`/api/v1/filings?${params}`);
    return { filings: response.data, meta: response.meta ?? {} };
  }

  async historical(symbol: string, period = '1M'): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams({ symbol, period });
    const response = await this.request<NseServiceResponse<Record<string, unknown>[]>>(`/api/v1/historical?${params}`);
    return response.data;
  }

  async fiiDii(): Promise<any[]> {
    try {
      const response = await this.request<NseServiceResponse<any[]>>('/api/v1/market/fii-dii');
      return response.data || [];
    } catch {
      return [];
    }
  }

  async deals(): Promise<{ bulk: any[]; block: any[] }> {
    try {
      const response = await this.request<NseServiceResponse<{ bulk: any[]; block: any[] }>>('/api/v1/market/deals');
      return response.data || { bulk: [], block: [] };
    } catch {
      return { bulk: [], block: [] };
    }
  }

  async vixHistory(period = '1M'): Promise<any[]> {
    try {
      const params = new URLSearchParams({ period });
      const response = await this.request<NseServiceResponse<any[]>>(`/api/v1/market/vix?${params}`);
      return response.data || [];
    } catch {
      return [];
    }
  }

  async topMovers(): Promise<{ gainers: any[]; losers: any[] }> {
    try {
      const response = await this.request<NseServiceResponse<{ gainers: any[]; losers: any[] }>>('/api/v1/market/top-movers');
      return response.data || { gainers: [], losers: [] };
    } catch {
      return { gainers: [], losers: [] };
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(init.headers ?? {}),
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`NSE data service ${response.status}: ${body.slice(0, 300)}`);
      }

      return await response.json() as T;
    } catch (error) {
      logger.warn('NseDataServiceClient', `Request failed for ${path}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const nseDataService = new NseDataServiceClient();
