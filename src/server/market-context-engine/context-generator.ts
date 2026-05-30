import { db } from '../../lib/db';
import { 
  breadthIntelligence, sectorRotation, 
  liquidityFlows, leadershipRankings, volatilityRegimes 
} from '../../lib/db/schema';
import { desc, eq } from 'drizzle-orm';
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
      logger.error('MarketContextGenerator', `Regime query failed: ${err.message}`);
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
      logger.error('MarketContextGenerator', `Breadth query failed: ${err.message}`);
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
      logger.error('MarketContextGenerator', `Leading sectors query failed: ${err.message}`);
    }
      
    let weakeningSectors: any[] = [];
    try {
      weakeningSectors = await db.select({ name: sectorRotation.sectorName })
        .from(sectorRotation)
        .where(eq(sectorRotation.status, 'WEAKENING'))
        .orderBy(desc(sectorRotation.momentumScore))
        .limit(3);
    } catch (err: any) {
      logger.error('MarketContextGenerator', `Weakening sectors query failed: ${err.message}`);
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
      logger.error('MarketContextGenerator', `Liquidity query failed: ${err.message}`);
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
      logger.error('MarketContextGenerator', `Volatility query failed: ${err.message}`);
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
      logger.error('MarketContextGenerator', `Leadership leaders query failed: ${err.message}`);
    }

    let stealth: any[] = [];
    try {
      stealth = await db.select({ symbol: leadershipRankings.symbol })
        .from(leadershipRankings)
        .where(eq(leadershipRankings.category, 'STEALTH_ACCUMULATION'))
        .orderBy(desc(leadershipRankings.institutionalQualityScore))
        .limit(5);
    } catch (err: any) {
      logger.error('MarketContextGenerator', `Stealth query failed: ${err.message}`);
    }

    return {
      regime: regime ? {
        type: regime.regimeType,
        confidence: regime.confidenceScore,
        factors: regime.primaryFactors || [],
        durationDays: regime.durationDays,
      } : { type: 'UNKNOWN', confidence: 0, factors: [], durationDays: 0 },
      breadth: breadth ? {
        advances: breadth.advances,
        declines: breadth.declines,
        newHighs: breadth.newHighs52w || 0,
        newLows: breadth.newLows52w || 0,
        thrustSignal: !!breadth.breadthThrustSignal,
      } : { advances: 0, declines: 0, newHighs: 0, newLows: 0, thrustSignal: false },
      sectors: {
        leading: leadingSectors.map(s => s.name),
        weakening: weakeningSectors.map(s => s.name),
      },
      liquidity: liquidity ? {
        turnoverTrend: liquidity.turnoverExpansionRatio > 1.1 ? 'EXPANDING' : (liquidity.turnoverExpansionRatio < 0.9 ? 'CONTRACTING' : 'FLAT'),
        institutionalAccumulationScore: liquidity.institutionalAccumulationScore || 0,
      } : { turnoverTrend: 'NEUTRAL', institutionalAccumulationScore: 0 },
      volatility: vol ? {
        realized: vol.realizedVolatility || 0,
        impliedProxy: vol.impliedVolatilityProxy || 0,
        rallyQuality: vol.rallyQuality || 'NEUTRAL',
      } : { realized: 0, impliedProxy: 0, rallyQuality: 'NEUTRAL' },
      leadership: {
        trueLeaders: leaders.map(l => l.symbol),
        stealthAccumulation: stealth.map(s => s.symbol),
      },
      generatedAt: new Date().toISOString()
    };
  }
}

export const marketContextGenerator = new MarketContextGenerator();
