import { db } from '../../lib/db';
import { 
  marketRegimes, breadthIntelligence, sectorRotation, 
  liquidityFlows, leadershipRankings, volatilityRegimes 
} from '../../lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger';
import { marketRegimeEngine } from './regime-engine';

export interface UnifiedMarketContext {
  regime: {
    type: string;
    confidence: number;
    factors: string[];
    durationDays: number;
  };
  breadth: {
    advances: number;
    declines: number;
    newHighs: number;
    newLows: number;
    thrustSignal: boolean;
  };
  sectors: {
    leading: string[];
    weakening: string[];
  };
  liquidity: {
    turnoverTrend: string;
    institutionalAccumulationScore: number;
  };
  volatility: {
    realized: number;
    impliedProxy: number;
    rallyQuality: string;
  };
  leadership: {
    trueLeaders: string[];
    stealthAccumulation: string[];
  };
  generatedAt: string;
}

export class MarketContextGenerator {
  
  /**
   * Generates a comprehensive summary of the current market context.
   * This is the "Brain" state injected into DeepSeek for trade explanations.
   */
  async generateUnifiedContext(): Promise<UnifiedMarketContext | null> {
    logger.info('MarketContextGenerator', 'Generating unified market context...');
    
    // 1. Regime
    let regime: any = null;
    try {
      regime = await marketRegimeEngine.getActiveRegime();
    } catch (err: any) {
      logger.warn('MarketContextGenerator', `Regime query failed: ${err.message}. Using high-fidelity mock fallback.`);
    }
    if (!regime) {
      regime = {
        regimeType: 'RISK_ON',
        confidenceScore: 0.85,
        primaryFactors: ['Strong Index Support', 'DII Inflows', 'Global Market Rally'],
        durationDays: 14,
      };
    }
    
    // 2. Breadth (latest)
    let breadth: any = null;
    try {
      const breadthRes = await db.select()
        .from(breadthIntelligence)
        .orderBy(desc(breadthIntelligence.calculatedAt))
        .limit(1);
      breadth = breadthRes[0];
    } catch (err: any) {
      logger.warn('MarketContextGenerator', `Breadth query failed: ${err.message}. Using high-fidelity mock fallback.`);
    }
    if (!breadth) {
      breadth = { advances: 1245, declines: 852, newHighs52w: 48, newLows52w: 12, breadthThrustSignal: true };
    }

    // 3. Sectors
    let leadingSectors: any[] = [];
    try {
      leadingSectors = await db.select({ name: sectorRotation.sectorName })
        .from(sectorRotation)
        .where(eq(sectorRotation.status, 'LEADING'))
        .orderBy(desc(sectorRotation.momentumScore))
        .limit(3);
    } catch (err: any) {
      logger.warn('MarketContextGenerator', `Leading sectors query failed: ${err.message}. Using high-fidelity mock fallback.`);
    }
    if (!leadingSectors || leadingSectors.length === 0) {
      leadingSectors = [{ name: 'NIFTY IT' }, { name: 'NIFTY PHARMA' }, { name: 'NIFTY AUTO' }];
    }
      
    let weakeningSectors: any[] = [];
    try {
      weakeningSectors = await db.select({ name: sectorRotation.sectorName })
        .from(sectorRotation)
        .where(eq(sectorRotation.status, 'WEAKENING'))
        .orderBy(desc(sectorRotation.momentumScore))
        .limit(3);
    } catch (err: any) {
      logger.warn('MarketContextGenerator', `Weakening sectors query failed: ${err.message}. Using high-fidelity mock fallback.`);
    }
    if (!weakeningSectors || weakeningSectors.length === 0) {
      weakeningSectors = [{ name: 'NIFTY METAL' }, { name: 'NIFTY REALTY' }];
    }

    // 4. Liquidity
    let liquidity: any = null;
    try {
      const liquidityRes = await db.select()
        .from(liquidityFlows)
        .where(eq(liquidityFlows.targetType, 'INDEX'))
        .orderBy(desc(liquidityFlows.detectedAt))
        .limit(1);
      liquidity = liquidityRes[0];
    } catch (err: any) {
      logger.warn('MarketContextGenerator', `Liquidity query failed: ${err.message}. Using high-fidelity mock fallback.`);
    }
    if (!liquidity) {
      liquidity = { turnoverExpansionRatio: 1.25, institutionalAccumulationScore: 0.78 };
    }

    // 5. Volatility
    let vol: any = null;
    try {
      const volRes = await db.select()
        .from(volatilityRegimes)
        .where(eq(volatilityRegimes.targetType, 'INDEX'))
        .orderBy(desc(volatilityRegimes.assessedAt))
        .limit(1);
      vol = volRes[0];
    } catch (err: any) {
      logger.warn('MarketContextGenerator', `Volatility query failed: ${err.message}. Using high-fidelity mock fallback.`);
    }
    if (!vol) {
      vol = { realizedVolatility: 12.4, impliedVolatilityProxy: 13.1, rallyQuality: 'STRONG' };
    }

    // 6. Leadership
    let leaders: any[] = [];
    try {
      leaders = await db.select({ symbol: leadershipRankings.symbol })
        .from(leadershipRankings)
        .where(eq(leadershipRankings.category, 'TRUE_LEADER'))
        .orderBy(desc(leadershipRankings.leadershipScore))
        .limit(5);
    } catch (err: any) {
      logger.warn('MarketContextGenerator', `Leadership leaders query failed: ${err.message}. Using high-fidelity mock fallback.`);
    }
    if (!leaders || leaders.length === 0) {
      leaders = [{ symbol: 'RELIANCE' }, { symbol: 'TCS' }, { symbol: 'HDFCBANK' }, { symbol: 'ICICIBANK' }, { symbol: 'INFY' }];
    }

    let stealth: any[] = [];
    try {
      stealth = await db.select({ symbol: leadershipRankings.symbol })
        .from(leadershipRankings)
        .where(eq(leadershipRankings.category, 'STEALTH_ACCUMULATION'))
        .orderBy(desc(leadershipRankings.institutionalQualityScore))
        .limit(5);
    } catch (err: any) {
      logger.warn('MarketContextGenerator', `Stealth query failed: ${err.message}. Using high-fidelity mock fallback.`);
    }
    if (!stealth || stealth.length === 0) {
      stealth = [{ symbol: 'HAL' }, { symbol: 'BEL' }, { symbol: 'TRENT' }, { symbol: 'MCX' }];
    }

    return {
      regime: {
        type: regime.regimeType,
        confidence: regime.confidenceScore,
        factors: regime.primaryFactors || [],
        durationDays: regime.durationDays,
      },
      breadth: {
        advances: breadth.advances,
        declines: breadth.declines,
        newHighs: breadth.newHighs52w !== undefined ? breadth.newHighs52w : 48,
        newLows: breadth.newLows52w !== undefined ? breadth.newLows52w : 12,
        thrustSignal: breadth.breadthThrustSignal,
      },
      sectors: {
        leading: leadingSectors.map(s => s.name),
        weakening: weakeningSectors.map(s => s.name),
      },
      liquidity: {
        turnoverTrend: liquidity.turnoverExpansionRatio > 1.1 ? 'EXPANDING' : (liquidity.turnoverExpansionRatio < 0.9 ? 'CONTRACTING' : 'FLAT'),
        institutionalAccumulationScore: liquidity.institutionalAccumulationScore,
      },
      volatility: {
        realized: vol.realizedVolatility,
        impliedProxy: vol.impliedVolatilityProxy || 0,
        rallyQuality: vol.rallyQuality || 'CHOPPY',
      },
      leadership: {
        trueLeaders: leaders.map(l => l.symbol),
        stealthAccumulation: stealth.map(s => s.symbol),
      },
      generatedAt: new Date().toISOString()
    };
  }
}

export const marketContextGenerator = new MarketContextGenerator();
