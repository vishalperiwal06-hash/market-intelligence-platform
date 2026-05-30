/**
 * Production Data Source Orchestrator
 * 
 * Manages provider priorities, failovers, rate limiting, and data quality routing.
 * Ensures the platform continues functioning seamlessly even if primary sources go down.
 */
import { MarketDataAdapter, NormalizedMarketData } from '../adapters/base';
import { providerHealthEngine } from './health';
import { rateLimitEngine } from './rate-limiter';
import { dataQualityEngine } from './quality-engine';
import { symbolMaster } from './symbol-master';
import { logger } from '../../../lib/logger';
import { redis } from '../../../lib/redis';

export interface ProviderRegistration {
  adapter: MarketDataAdapter;
  priority: number; // 1 = Primary, 2 = Secondary, 3 = Fallback
  isRealtimeCapable: boolean;
}

export class SourceOrchestrator {
  private providers: ProviderRegistration[] = [];

  register(adapter: MarketDataAdapter, priority: number, isRealtimeCapable: boolean = true) {
    this.providers.push({ adapter, priority, isRealtimeCapable });
    this.providers.sort((a, b) => a.priority - b.priority);
    logger.info('SourceOrchestrator', `Registered ${adapter.name} (Priority ${priority})`);
  }

  /**
   * Fetches quotes orchestrating across all providers with failover.
   */
  async fetchQuotes(unifiedSymbols: string[]): Promise<NormalizedMarketData[]> {
    let pendingSymbols = [...unifiedSymbols];
    const finalResults: NormalizedMarketData[] = [];

    for (const { adapter, priority } of this.providers) {
      if (pendingSymbols.length === 0) break;
      
      // 1. Check Circuit Breaker
      if (!providerHealthEngine.isHealthy(adapter.name)) {
        logger.debug('SourceOrchestrator', `Skipping ${adapter.name} (Circuit Breaker OPEN)`);
        continue;
      }

      // 2. Map Symbols for this specific provider
      const symbolPairs = pendingSymbols
        .map(sym => ({
          unified: sym,
          provider: symbolMaster.getProviderSymbol(sym, adapter.name.toLowerCase() as any),
        }))
        .filter(pair => pair.provider);

      if (symbolPairs.length === 0) {
        continue;
      }

      // 3. Rate Limit & Batching
      const batches = rateLimitEngine.getBatches(adapter.name, symbolPairs);
      
      for (const batch of batches) {
        try {
          await rateLimitEngine.acquire(adapter.name); // Will throw if rate limited
          
          const startTime = Date.now();
          const rawQuotes = await adapter.fetchQuotes(batch.map(item => item.provider));
          const latency = Date.now() - startTime;
          
          // 4. Record Health (Success)
          providerHealthEngine.recordSuccess(adapter.name, latency);

          // 5. Data Quality Validation
          const validQuotes = await dataQualityEngine.validateQuotes(adapter.name, rawQuotes);
          
          // Mark as sourced from this provider
          validQuotes.forEach(q => {
            q.source = adapter.name;
            q.isFallback = priority > 1; // Mark as fallback if not primary

            // Check provider vs local node clock skew
            const providerTime = new Date(q.timestamp).getTime();
            const localTime = Date.now();
            const skewSeconds = Math.abs(localTime - providerTime) / 1000;
            if (skewSeconds > 5) {
              logger.warn('SourceOrchestrator', `Clock skew detected for quote ${q.symbol} from ${adapter.name}`, {
                providerTime: q.timestamp,
                localTime: new Date(localTime).toISOString(),
                skewSeconds,
              });
            }

            finalResults.push(q);
            
            // Remove from pending by finding the matching unified symbol
            // Hacky reverse lookup for simplicity:
            const matchedPair = batch.find(item => item.provider === q.symbol || item.unified === q.symbol);
            const unified = matchedPair?.unified || pendingSymbols.find(
              p => symbolMaster.getProviderSymbol(p, adapter.name.toLowerCase() as any) === q.symbol
            );
            if (unified) {
              pendingSymbols = pendingSymbols.filter(s => s !== unified);
              q.symbol = unified;
            }
          });
          
        } catch (error: any) {
          // 4. Record Health (Failure)
          providerHealthEngine.recordFailure(adapter.name, error);
          logger.warn('SourceOrchestrator', `${adapter.name} failed batch: ${error.message}`);
          break; // Move to next provider for remaining symbols
        }
      }
    }

    if (pendingSymbols.length > 0) {
      logger.warn('SourceOrchestrator', `Fetching stale cached quotes from Redis for ${pendingSymbols.length} pending symbols`);
      for (const sym of pendingSymbols) {
        try {
          const cached = await redis.hgetall(`market:tick:${sym}`);
          if (cached && cached.price) {
            finalResults.push({
              symbol: sym,
              price: parseFloat(cached.price),
              change: parseFloat(cached.change || '0'),
              changePercent: parseFloat(cached.changePercent || '0'),
              volume: parseInt(cached.volume || '0', 10),
              turnover: parseFloat(cached.turnover || '0'),
              high: parseFloat(cached.high || cached.price),
              low: parseFloat(cached.low || cached.price),
              open: parseFloat(cached.open || cached.price),
              close: parseFloat(cached.close || cached.price),
              timestamp: cached.timestamp || new Date().toISOString(),
              exchange: (cached.exchange as 'NSE' | 'BSE' | 'UNKNOWN') || 'NSE',
              source: (cached.source || 'UNKNOWN') + '-Stale',
              isFallback: true,
            });
            pendingSymbols = pendingSymbols.filter(s => s !== sym);
          }
        } catch (err) {}
      }
    }

    if (pendingSymbols.length > 0) {
      logger.error('SourceOrchestrator', `Failed to fetch quotes for ${pendingSymbols.length} symbols across all providers.`);
    }

    return finalResults;
  }

  async fetchIndices(): Promise<NormalizedMarketData[]> {
    const combined: NormalizedMarketData[] = [];
    const seen = new Set<string>();

    for (const { adapter } of this.providers) {
       if (!providerHealthEngine.isHealthy(adapter.name)) continue;
       try {
         const startTime = Date.now();
         const indices = await adapter.fetchIndices();
         providerHealthEngine.recordSuccess(adapter.name, Date.now() - startTime);
         
         const valid = await dataQualityEngine.validateQuotes(adapter.name, indices);
         for (const idx of valid) {
           const normSymbol = idx.symbol.toUpperCase().trim();
           if (!seen.has(normSymbol)) {
             seen.add(normSymbol);
             combined.push(idx);
           }
         }
       } catch (err: any) {
         providerHealthEngine.recordFailure(adapter.name, err);
       }
    }
    return combined;
  }
}

export const sourceOrchestrator = new SourceOrchestrator();
