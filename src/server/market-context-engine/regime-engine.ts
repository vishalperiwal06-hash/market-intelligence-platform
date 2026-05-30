import { db } from '../../lib/db';
import { marketRegimes } from '../../lib/db/schema';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { desc, eq } from 'drizzle-orm';

export type RegimeType = 
  | 'RISK_ON' 
  | 'RISK_OFF' 
  | 'ACCUMULATION' 
  | 'DISTRIBUTION' 
  | 'MOMENTUM_EXPANSION' 
  | 'MEAN_REVERSION' 
  | 'HIGH_VOLATILITY' 
  | 'LOW_VOLATILITY' 
  | 'LIQUIDITY_EXPANSION' 
  | 'LIQUIDITY_CONTRACTION';

export interface RegimeAnalysisResult {
  regimeType: RegimeType;
  confidenceScore: number;
  primaryFactors: string[];
  durationDays: number;
}

export class MarketRegimeEngine {
  /**
   * Assesses the current market regime based on various internal indicators.
   * This would typically aggregate data from breadth, liquidity, volatility, etc.
   */
  async assessCurrentRegime(
    advances: number, 
    declines: number, 
    vixProxy: number, 
    turnoverTrend: number
  ): Promise<RegimeAnalysisResult> {
    logger.info('MarketRegimeEngine', 'Assessing current market regime...');
    
    // Simplistic heuristic for demonstration. 
    // In production, this uses multi-factor probabilistic models.
    let regime: RegimeType = 'RISK_ON';
    let confidence = 0.5;
    const factors: string[] = [];

    const adRatio = declines === 0 ? advances : advances / declines;

    if (adRatio > 1.5 && turnoverTrend > 1.1) {
      regime = 'MOMENTUM_EXPANSION';
      confidence = 0.8;
      factors.push('Strong A/D Ratio', 'Expanding Turnover');
    } else if (adRatio < 0.7 && vixProxy > 20) {
      regime = 'RISK_OFF';
      confidence = 0.85;
      factors.push('Poor A/D Ratio', 'High Volatility');
    } else if (adRatio > 1.0 && vixProxy < 15) {
      regime = 'ACCUMULATION';
      confidence = 0.7;
      factors.push('Positive Breadth', 'Low Volatility');
    } else if (adRatio < 0.8 && turnoverTrend > 1.2) {
      regime = 'DISTRIBUTION';
      confidence = 0.75;
      factors.push('Negative Breadth', 'High Volume on Declines');
    }

    const result: RegimeAnalysisResult = {
      regimeType: regime,
      confidenceScore: confidence,
      primaryFactors: factors,
      durationDays: 1, // Defaulting to 1 for new regime detection
    };

    await this.persistRegime(result);
    return result;
  }

  private async persistRegime(result: RegimeAnalysisResult) {
    try {
      // Check current active regime
      const current = await db.select()
        .from(marketRegimes)
        .where(eq(marketRegimes.isActive, true))
        .orderBy(desc(marketRegimes.assessedAt))
        .limit(1);

      if (current.length > 0 && current[0].regimeType === result.regimeType) {
        // Same regime continues, update duration
        await db.update(marketRegimes)
          .set({ 
            durationDays: current[0].durationDays + 1,
            assessedAt: new Date(),
            confidenceScore: result.confidenceScore,
            primaryFactors: result.primaryFactors
          })
          .where(eq(marketRegimes.id, current[0].id));
      } else {
        // Regime changed
        if (current.length > 0) {
          await db.update(marketRegimes)
            .set({ isActive: false })
            .where(eq(marketRegimes.id, current[0].id));
        }

        await db.insert(marketRegimes).values({
          regimeType: result.regimeType,
          confidenceScore: result.confidenceScore,
          primaryFactors: result.primaryFactors,
          durationDays: 1,
          isActive: true,
        });
        
        logger.info('MarketRegimeEngine', `New Regime Detected: ${result.regimeType}`);
      }
      
      // Cache the active regime for fast retrieval
      await redis.set('market:regime:active', JSON.stringify(result), 'EX', 3600);
      
    } catch (error) {
      logger.error('MarketRegimeEngine', 'Failed to persist regime', error);
    }
  }

  async getActiveRegime(): Promise<RegimeAnalysisResult | null> {
    const cached = await redis.get('market:regime:active');
    if (cached) return JSON.parse(cached);

    try {
      const active = await db.select()
        .from(marketRegimes)
        .where(eq(marketRegimes.isActive, true))
        .orderBy(desc(marketRegimes.assessedAt))
        .limit(1);

      if (active.length > 0) {
        const res: RegimeAnalysisResult = {
          regimeType: active[0].regimeType as RegimeType,
          confidenceScore: active[0].confidenceScore,
          primaryFactors: active[0].primaryFactors as string[],
          durationDays: active[0].durationDays,
        };
        await redis.set('market:regime:active', JSON.stringify(res), 'EX', 3600);
        return res;
      }
      return null;
    } catch (error) {
      logger.error('MarketRegimeEngine', 'Failed to fetch active regime', error);
      return null;
    }
  }
}

export const marketRegimeEngine = new MarketRegimeEngine();
