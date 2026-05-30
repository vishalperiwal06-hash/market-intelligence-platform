import { MarketDataAdapter, NormalizedMarketData } from './base';
import { logger } from '../../../lib/logger';

const BSE_BASE_URL = 'https://api.bseindia.com/BseIndiaAPI/api';
const REQUEST_TIMEOUT_MS = Number(process.env.BSE_TIMEOUT_MS || 8000);
const RETRY_ATTEMPTS = Number(process.env.BSE_RETRY_ATTEMPTS || 2);
const BATCH_CONCURRENCY = Number(process.env.BSE_BATCH_CONCURRENCY || 4);

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.bseindia.com/',
  'Origin': 'https://www.bseindia.com',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ConcurrencyLimiter {
  private activeCount = 0;
  private queue: (() => void)[] = [];
  constructor(private maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export class BSEAdapter implements MarketDataAdapter {
  name = 'BSE-Direct';
  private fetchLimiter = new ConcurrencyLimiter(10);

  async init() {
    logger.info('BSEAdapter', 'Initializing BSE Direct Adapter');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(`${BSE_BASE_URL}/MarketStatus/w`, {
        headers: { Accept: 'application/json' },
      });
      return res.ok;
    } catch (e) {
      logger.warn('BSEAdapter', 'Health check failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  async fetchQuotes(symbols: string[]): Promise<NormalizedMarketData[]> {
    const mappedSymbols = symbols
      .map(symbol => symbol.trim())
      .filter(symbol => /^\d+$/.test(symbol));

    if (mappedSymbols.length === 0) {
      return [];
    }

    const results: NormalizedMarketData[] = [];

    for (let i = 0; i < mappedSymbols.length; i += BATCH_CONCURRENCY) {
      const batch = mappedSymbols.slice(i, i + BATCH_CONCURRENCY);
      const resolved = await Promise.all(batch.map(symbol => this.fetchQuoteWithRetry(symbol)));
      for (const quote of resolved) {
        if (quote) results.push(quote);
      }
    }

    return results;
  }

  async fetchIndices(): Promise<NormalizedMarketData[]> {
    try {
      const res = await this.fetchWithTimeout(`${BSE_BASE_URL}/Sensex/IndexDetails/S&P BSE SENSEX`, {
        headers: { Accept: 'application/json', Referer: 'https://www.bseindia.com/' },
      });

      if (!res.ok) return [];
      const data = await res.json();

      return [{
        symbol: 'SENSEX',
        price: parseFloat(data?.CurrValue || '0'),
        change: parseFloat(data?.Chg || '0'),
        changePercent: parseFloat(data?.PcChg || '0'),
        volume: 0,
        turnover: 0,
        high: parseFloat(data?.High || data?.CurrValue || '0'),
        low: parseFloat(data?.Low || data?.CurrValue || '0'),
        open: parseFloat(data?.Open || data?.CurrValue || '0'),
        close: parseFloat(data?.PrevClose || data?.CurrValue || '0'),
        timestamp: new Date().toISOString(),
        exchange: 'BSE',
      }];
    } catch (err) {
      logger.warn('BSEAdapter', 'Failed to fetch indices', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchQuoteWithRetry(symbol: string): Promise<NormalizedMarketData | null> {
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const quote = await this.fetchSingleQuote(symbol);
        if (quote) return quote;
        return null;
      } catch (error) {
        const isLastAttempt = attempt >= RETRY_ATTEMPTS;
        logger.warn('BSEAdapter', 'Quote fetch attempt failed', {
          symbol,
          attempt,
          isLastAttempt,
          error: error instanceof Error ? error.message : String(error),
        });

        if (!isLastAttempt) {
          const base = 250;
          const delay = base * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
          await sleep(delay);
          continue;
        }
      }
    }

    return null;
  }

  private async fetchSingleQuote(symbol: string): Promise<NormalizedMarketData | null> {
    const res = await this.fetchWithTimeout(
      `${BSE_BASE_URL}/getScripHeaderData/Equity/${encodeURIComponent(symbol)}`,
      { headers: { Accept: 'application/json', Referer: 'https://www.bseindia.com/' } },
    );

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        return null;
      }
      throw new Error(`BSE returned ${res.status}`);
    }

    const data = await res.json();
    if (!data?.Header) return null;

    const h = data.Header;
    return {
      symbol,
      price: parseFloat(h.LTP || '0'),
      change: parseFloat(h.Change || '0'),
      changePercent: parseFloat(h.PerChange || '0'),
      volume: parseInt(h.TotalQty || '0', 10),
      turnover: parseFloat(h.TotalVal || '0'),
      high: parseFloat(h.High || h.LTP || '0'),
      low: parseFloat(h.Low || h.LTP || '0'),
      open: parseFloat(h.Open || h.LTP || '0'),
      close: parseFloat(h.PrevClose || h.LTP || '0'),
      timestamp: new Date().toISOString(),
      exchange: 'BSE',
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    return this.fetchLimiter.run(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            ...BROWSER_HEADERS,
            ...(init.headers ?? {}),
          },
        });
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}
