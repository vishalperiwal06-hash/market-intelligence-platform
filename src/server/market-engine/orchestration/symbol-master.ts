import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { nseDataService, NseSymbolRecord } from '@/server/nse/nselib-service';
import { db } from '@/lib/db';
import { companies } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export interface SymbolMap {
  unifiedSymbol: string;
  nseSymbol?: string;
  bseScripCode?: string;
  yahooSymbol: string;
  isin?: string;
  industry?: string;
  sector?: string;
  series?: string;
  instrumentType?: string;
  isFno?: boolean;
  isSme?: boolean;
  isEtf?: boolean;
  lotSize?: number | null;
}

export class SymbolMaster {
  private map = new Map<string, SymbolMap>();
  private lastRefreshAt = 0;
  private refreshPromise: Promise<string[]> | null = null;
  private readonly refreshIntervalMs = 24 * 60 * 60 * 1000;

  constructor() {
    this.register({
      unifiedSymbol: 'RELIANCE',
      nseSymbol: 'RELIANCE',
      bseScripCode: '500325',
      yahooSymbol: 'RELIANCE.NS',
      sector: 'Energy',
      industry: 'Refineries',
    });
    this.register({
      unifiedSymbol: 'TCS',
      nseSymbol: 'TCS',
      bseScripCode: '532540',
      yahooSymbol: 'TCS.NS',
      sector: 'Information Technology',
      industry: 'Computers - Software',
    });
    this.register({
      unifiedSymbol: 'HDFCBANK',
      nseSymbol: 'HDFCBANK',
      bseScripCode: '500180',
      yahooSymbol: 'HDFCBANK.NS',
      sector: 'Financial Services',
      industry: 'Banks - Private Sector',
    });
    this.register({
      unifiedSymbol: 'NIFTY50',
      nseSymbol: 'NIFTY 50',
      yahooSymbol: '^NSEI',
      sector: 'Index',
      instrumentType: 'INDEX',
    });
    this.register({
      unifiedSymbol: 'SENSEX',
      bseScripCode: 'SENSEX',
      yahooSymbol: '^BSESN',
      sector: 'Index',
      instrumentType: 'INDEX',
    });
  }

  register(map: SymbolMap) {
    this.map.set(map.unifiedSymbol.toUpperCase(), {
      ...map,
      unifiedSymbol: map.unifiedSymbol.toUpperCase(),
    });
  }

  resolve(symbol: string): SymbolMap {
    const normalized = symbol.toUpperCase();
    if (this.map.has(normalized)) {
      return this.map.get(normalized)!;
    }

    return {
      unifiedSymbol: normalized,
      nseSymbol: normalized,
      yahooSymbol: `${normalized}.NS`,
    };
  }

  async refreshUniverse(force = false): Promise<string[]> {
    const now = Date.now();
    if (!force && now - this.lastRefreshAt < this.refreshIntervalMs && this.map.size > 5) {
      return this.getAllSymbols();
    }

    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.loadUniverse(force).finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  getAllSymbols(): string[] {
    return Array.from(this.map.keys()).sort();
  }

  getSymbolsByType(type: 'all' | 'fno' | 'sme' | 'etf' = 'all'): string[] {
    const maps = Array.from(this.map.values());
    if (type === 'fno') return maps.filter(item => item.isFno).map(item => item.unifiedSymbol).sort();
    if (type === 'sme') return maps.filter(item => item.isSme).map(item => item.unifiedSymbol).sort();
    if (type === 'etf') return maps.filter(item => item.isEtf).map(item => item.unifiedSymbol).sort();
    return this.getAllSymbols();
  }

  getProviderSymbol(unifiedSymbol: string, provider: 'nse' | 'bse' | 'yahoo' | 'samco' | string): string {
    const map = this.resolve(unifiedSymbol);

    switch (provider) {
      case 'nse':
      case 'nse-nselib':
        return map.nseSymbol || map.unifiedSymbol;
      case 'bse':
      case 'bse-direct':
        return map.bseScripCode || '';
      case 'yahoo':
        return map.yahooSymbol;
      case 'samco':
        return map.nseSymbol ? `NSE_EQ:${map.nseSymbol}` : map.unifiedSymbol;
      default:
        return map.unifiedSymbol;
    }
  }

  private async loadUniverse(force: boolean): Promise<string[]> {
    let loadedFromNseService = false;

    // Primary: try NSE data service
    try {
      const records = await nseDataService.universe(force);
      if (records && records.length > 0) {
        records.forEach(record => this.register(this.fromNseRecord(record)));
        this.lastRefreshAt = Date.now();
        loadedFromNseService = true;

        await redis.set('symbol:universe:last_refresh', new Date(this.lastRefreshAt).toISOString(), 'EX', 172800);
        await redis.set('symbol:universe:count', String(records.length), 'EX', 172800);

        logger.info('SymbolMaster', 'NSE universe refreshed from data service', { count: records.length });

        // Upsert retrieved companies to PostgreSQL in batches of 100
        try {
          const values = records
            .filter(record => record.symbol && !record.symbol.includes(' '))
            .map(record => ({
              symbol: record.symbol.toUpperCase(),
              name: record.name || record.symbol,
              sector: record.sector || null,
              industry: record.industry || null,
              exchange: record.exchange || 'NSE',
              isActive: true,
              updatedAt: new Date(),
            }));

          for (let i = 0; i < values.length; i += 100) {
            const batch = values.slice(i, i + 100);
            await db.insert(companies).values(batch)
              .onConflictDoUpdate({
                target: companies.symbol,
                set: {
                  name: sql`EXCLUDED.name`,
                  sector: sql`EXCLUDED.sector`,
                  industry: sql`EXCLUDED.industry`,
                  exchange: sql`EXCLUDED.exchange`,
                  isActive: sql`EXCLUDED.is_active`,
                  updatedAt: sql`EXCLUDED.updated_at`
                }
              });
          }
          logger.info('SymbolMaster', 'Companies upserted to PostgreSQL successfully');
        } catch (dbErr) {
          logger.error('SymbolMaster', 'Failed to upsert companies to PostgreSQL database', dbErr);
        }
      }
    } catch (error) {
      logger.warn('SymbolMaster', 'NSE data service universe refresh failed', { error });
    }

    // Fallback: if NSE service failed or returned nothing, load from PostgreSQL
    if (!loadedFromNseService && this.map.size <= 10) {
      try {
        logger.info('SymbolMaster', 'Loading universe from PostgreSQL companies table as fallback...');
        const dbCompanies = await db.select({
          symbol: companies.symbol,
          name: companies.name,
          sector: companies.sector,
          industry: companies.industry,
          exchange: companies.exchange,
        }).from(companies).where(sql`${companies.isActive} = true`);

        if (dbCompanies.length > 0) {
          for (const c of dbCompanies) {
            const symbol = c.symbol.toUpperCase().trim();
            if (!symbol || symbol.includes(' ')) continue;
            this.register({
              unifiedSymbol: symbol,
              nseSymbol: symbol,
              yahooSymbol: `${symbol}.NS`,
              sector: c.sector ?? undefined,
              industry: c.industry ?? undefined,
            });
          }
          this.lastRefreshAt = Date.now();
          logger.info('SymbolMaster', `Universe loaded from PostgreSQL fallback`, { count: dbCompanies.length, mapSize: this.map.size });
        }
      } catch (dbErr) {
        logger.error('SymbolMaster', 'PostgreSQL fallback universe load also failed', dbErr);
      }
    }

    return this.getAllSymbols();
  }


  private fromNseRecord(record: NseSymbolRecord): SymbolMap {
    const symbol = record.symbol.toUpperCase();
    return {
      unifiedSymbol: symbol,
      nseSymbol: symbol,
      yahooSymbol: `${symbol}.NS`,
      isin: record.isin ?? undefined,
      industry: record.industry ?? undefined,
      sector: record.sector ?? undefined,
      series: record.series ?? undefined,
      instrumentType: record.instrument_type,
      isFno: record.is_fno,
      isSme: record.is_sme,
      isEtf: record.is_etf,
      lotSize: record.lot_size,
    };
  }
}

export const symbolMaster = new SymbolMaster();
