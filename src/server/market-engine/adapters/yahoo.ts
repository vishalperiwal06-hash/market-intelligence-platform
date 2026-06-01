import { MarketDataAdapter, NormalizedMarketData } from './base';
import { logger } from '../../../lib/logger';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

export class YahooAdapter implements MarketDataAdapter {
  name = 'YahooFinance';

  async init() {
    logger.info('YahooAdapter', 'Initializing Yahoo Finance Adapter (Fallback)');
  }

  async healthCheck() {
    try {
      await yahooFinance.quote('RELIANCE.NS');
      return true;
    } catch (e) {
      logger.error('YahooAdapter', 'Health check failed', e);
      return false;
    }
  }

  async fetchQuotes(symbols: string[]): Promise<NormalizedMarketData[]> {
    if (!symbols || symbols.length === 0) return [];

    try {
      // Yahoo symbols for Indian stocks usually have .NS or .BO
      const yahooSymbolMap = new Map<string, string>();
      const querySymbols = symbols.map(s => {
        const upper = s.toUpperCase().trim();
        if (upper.startsWith('^')) {
          yahooSymbolMap.set(upper, s);
          return upper;
        }
        if (upper.startsWith('BSE:')) {
          const code = upper.split(':')[1];
          if (code) {
            const yahooSym = `${code}.BO`;
            yahooSymbolMap.set(yahooSym, s);
            return yahooSym;
          }
        }
        if (upper.endsWith('.NS') || upper.endsWith('.BO')) {
          yahooSymbolMap.set(upper, s);
          return upper;
        }
        const yahooSym = `${upper}.NS`;
        yahooSymbolMap.set(yahooSym, s);
        return yahooSym;
      });
      
      const results = await yahooFinance.quote(querySymbols);
      const quotes: any[] = Array.isArray(results) ? results : [results];
 
      return quotes.filter(Boolean).map(quote => {
        const originalSym = yahooSymbolMap.get(quote.symbol) || quote.symbol.replace('.NS', '').replace('.BO', '');
        return {
          symbol: originalSym,
          price: quote.regularMarketPrice || 0,
          change: quote.regularMarketChange || 0,
          changePercent: quote.regularMarketChangePercent || 0,
          volume: quote.regularMarketVolume || 0,
          turnover: (quote.regularMarketPrice || 0) * (quote.regularMarketVolume || 0),
          high: quote.regularMarketDayHigh || 0,
          low: quote.regularMarketDayLow || 0,
          open: quote.regularMarketOpen || 0,
          close: quote.regularMarketPreviousClose || 0,
          timestamp: new Date().toISOString(),
          exchange: quote.symbol.endsWith('.NS') ? 'NSE' : quote.symbol.endsWith('.BO') ? 'BSE' : 'UNKNOWN'
        };
      });
    } catch (error) {
      logger.error('YahooAdapter', 'Failed to fetch quotes', error);
      return [];
    }
  }

  async fetchIndices() {
    return this.fetchQuotes(['^NSEI', '^NSEBANK', '^BSESN']); // NIFTY, BANKNIFTY, SENSEX
  }
}
