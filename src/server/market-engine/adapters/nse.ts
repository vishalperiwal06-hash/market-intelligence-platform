import { MarketDataAdapter, NormalizedMarketData } from './base';
import { logger } from '../../../lib/logger';
import { nseDataService } from '../../nse/nselib-service';

export class NSEAdapter implements MarketDataAdapter {
  name = 'NSE-nselib';

  async init() {
    logger.info('NSEAdapter', 'Initializing nselib-backed NSE adapter');
  }

  async healthCheck(): Promise<boolean> {
    return nseDataService.health();
  }

  async fetchQuotes(symbols: string[]): Promise<NormalizedMarketData[]> {
    return nseDataService.quotes(symbols);
  }

  async fetchIndices(): Promise<NormalizedMarketData[]> {
    return nseDataService.indices();
  }
}
