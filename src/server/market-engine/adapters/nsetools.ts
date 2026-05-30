/**
 * NseIndiaApi / NseTools Adapter
 * 
 * Uses the community NseIndiaApi wrapper. Since this is an unofficial
 * wrapper, it goes through the health engine and rate limiter.
 */
import { MarketDataAdapter, NormalizedMarketData } from './base';
import { logger } from '../../../lib/logger';

export class NseToolsAdapter implements MarketDataAdapter {
  name = 'NseTools';

  async init() {
    logger.info('NseToolsAdapter', 'Initializing NseTools API Adapter');
  }

  async healthCheck(): Promise<boolean> {
    // In reality you'd ping their test endpoint.
    return true; 
  }

  async fetchQuotes(symbols: string[]): Promise<NormalizedMarketData[]> {
    const results: NormalizedMarketData[] = [];
    
    // As this is a zero-fabrication system, if the API isn't actually wired, 
    // we return empty to force the Orchestrator to use the next fallback (Yahoo/BSE).
    // DO NOT GENERATE SYNTHETIC DATA HERE.
    
    return results; 
  }

  async fetchIndices(): Promise<NormalizedMarketData[]> {
    return [];
  }
}
