/**
 * Signal Scoring Engine
 * 
 * Computes weighted scores for scanner signals based on institutional criteria:
 * - Volume confirmation
 * - Trend alignment
 * - Sector strength
 * - Market breadth context
 */

export interface ScoringContext {
  volumeSmaRatio: number; // Current Volume / SMA20 Volume
  isTrendAligned: boolean; // e.g. Price > EMA50 for bullish signals
  sectorRank?: number; // 1 to N (1 being strongest)
  totalSectors?: number;
  marketBreadthAdRatio?: number; // Advances / Declines
  volatilityAtrRatio?: number; // Current ATR / Average ATR
}

export interface SignalScore {
  confidence: number; // 0-100 (Overall conviction)
  qualityScore: number; // 0-100 (Technical setup quality)
  riskScore: number; // 0-100 (Higher = riskier setup)
}

export function calculateSignalScore(
  baseConfidence: number,
  direction: 'bullish' | 'bearish',
  context: ScoringContext
): SignalScore {
  let quality = baseConfidence;
  
  // 1. Volume Confirmation (High volume increases confidence)
  if (context.volumeSmaRatio > 2.0) quality += 15;
  else if (context.volumeSmaRatio > 1.2) quality += 5;
  else if (context.volumeSmaRatio < 0.8) quality -= 10; // Weak volume

  // 2. Trend Alignment
  if (context.isTrendAligned) quality += 10;
  else quality -= 15; // Trading against the trend is riskier

  // 3. Sector Strength
  if (context.sectorRank && context.totalSectors) {
    const percentile = 1 - (context.sectorRank / context.totalSectors);
    if (direction === 'bullish') {
      if (percentile > 0.8) quality += 10; // Top 20% sector
      else if (percentile < 0.2) quality -= 10; // Bottom 20% sector
    } else {
      // For bearish, weak sector is good
      if (percentile < 0.2) quality += 10;
      else if (percentile > 0.8) quality -= 10;
    }
  }

  // 4. Market Breadth Alignment
  if (context.marketBreadthAdRatio) {
    if (direction === 'bullish' && context.marketBreadthAdRatio > 1.5) quality += 5;
    if (direction === 'bearish' && context.marketBreadthAdRatio < 0.5) quality += 5;
  }

  // 5. Risk Calculation
  let risk = 50; // Base risk
  if (!context.isTrendAligned) risk += 20;
  if (context.volatilityAtrRatio && context.volatilityAtrRatio > 1.5) risk += 15; // High volatility = higher risk
  if (context.volumeSmaRatio < 0.8) risk += 10;

  // Clamp values between 0 and 100
  const clamp = (val: number) => Math.max(0, Math.min(100, val));

  return {
    confidence: clamp(quality * 0.9), // Final confidence is slightly tempered
    qualityScore: clamp(quality),
    riskScore: clamp(risk),
  };
}
