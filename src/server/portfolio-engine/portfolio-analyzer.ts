import { db } from '../../lib/db';
import { portfolioHoldings, watchlists } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';

export interface PortfolioAnalysis {
  totalValue: number;
  holdingsCount: number;
  concentrationRisk: boolean;
  sectorExposure: Record<string, number>;
  warnings: string[];
}

export class PortfolioAnalyzer {
  /**
   * Analyzes a portfolio's risk profile based on actual stored holdings.
   * STRICT ZERO-FABRICATION: Does not guess live prices. Must use a live market 
   * data provider. Since we don't have a live websocket linked to this engine yet, 
   * we calculate based on averagePrice or cached prices in Redis.
   */
  async analyzePortfolio(portfolioId: string): Promise<PortfolioAnalysis> {
    logger.info('PortfolioAnalyzer', `Analyzing portfolio ${portfolioId}`);

    const holdings = await db.select().from(portfolioHoldings).where(eq(portfolioHoldings.portfolioId, portfolioId));

    if (holdings.length === 0) {
      return { totalValue: 0, holdingsCount: 0, concentrationRisk: false, sectorExposure: {}, warnings: ['Portfolio is empty'] };
    }

    let totalValue = 0;
    const exposure: Record<string, number> = {};
    const warnings: string[] = [];

    // In a real app, you fetch Sector mappings from the companies table
    // For architecture demo, we map some hardcoded sectors based on symbol just to prove the algorithm
    for (const h of holdings) {
      // Simulate fetching current price from Redis Cache (from ingestion pipeline)
      const cachedPriceStr = await redis.hget(`market:price:${h.symbol}`, 'lastPrice');
      const currentPrice = cachedPriceStr ? parseFloat(cachedPriceStr) : h.averagePrice; // Fallback to avg price if missing

      const holdingValue = currentPrice * h.quantity;
      totalValue += holdingValue;

      // Mock sector fetch (Architectural placeholder)
      const sector = this.inferSector(h.symbol);
      exposure[sector] = (exposure[sector] || 0) + holdingValue;
    }

    // Calculate percentages
    let maxSectorPct = 0;
    for (const sector in exposure) {
      const pct = exposure[sector] / totalValue;
      exposure[sector] = parseFloat(pct.toFixed(4));
      if (pct > maxSectorPct) maxSectorPct = pct;
    }

    // Flag concentration risk if one sector > 40%
    let concentrationRisk = false;
    if (maxSectorPct > 0.4) {
      concentrationRisk = true;
      warnings.push(`High concentration risk detected. A single sector represents ${(maxSectorPct * 100).toFixed(1)}% of the portfolio.`);
    }

    return {
      totalValue,
      holdingsCount: holdings.length,
      concentrationRisk,
      sectorExposure: exposure,
      warnings
    };
  }

  // Purely for architectural flow without a full DB of 5000 NSE stocks
  private inferSector(symbol: string): string {
    if (symbol.includes('BANK')) return 'Financials';
    if (symbol.includes('TECH') || symbol === 'TCS' || symbol === 'INFY') return 'IT';
    if (symbol === 'RELIANCE') return 'Energy';
    return 'Diversified';
  }
}

export const portfolioAnalyzer = new PortfolioAnalyzer();
