export interface NormalizedMarketData {
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
  timestamp: string;
  exchange: 'NSE' | 'BSE' | 'UNKNOWN';
  source?: string;
  isFallback?: boolean;
}

export interface MarketDataAdapter {
  name: string;
  init(): Promise<void>;
  fetchQuotes(symbols: string[]): Promise<NormalizedMarketData[]>;
  fetchIndices(): Promise<any>;
  healthCheck(): Promise<boolean>;
}
