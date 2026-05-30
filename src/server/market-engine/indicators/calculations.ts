/**
 * Technical Indicator Calculation Library
 *
 * Pure math functions — no data access, no side effects.
 * All inputs must be arrays of genuine market prices.
 * Returns NaN/null when insufficient data exists — never fabricates.
 */

export interface OHLCBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

// ──────────────────────────────────────────────
// EXPONENTIAL MOVING AVERAGE
// ──────────────────────────────────────────────
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return new Array(prices.length).fill(NaN);

  const k = 2 / (period + 1);
  const ema: number[] = new Array(prices.length).fill(NaN);

  // Seed the EMA with an SMA of the first `period` prices
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema[period - 1] = sum / period;

  for (let i = period; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

// ──────────────────────────────────────────────
// SIMPLE MOVING AVERAGE
// ──────────────────────────────────────────────
export function calculateSMA(prices: number[], period: number): number[] {
  if (prices.length < period) return new Array(prices.length).fill(NaN);

  const sma: number[] = new Array(prices.length).fill(NaN);
  let windowSum = 0;

  for (let i = 0; i < period; i++) {
    windowSum += prices[i];
  }
  sma[period - 1] = windowSum / period;

  for (let i = period; i < prices.length; i++) {
    windowSum += prices[i] - prices[i - period];
    sma[i] = windowSum / period;
  }
  return sma;
}

// ──────────────────────────────────────────────
// RSI (Relative Strength Index)
// ──────────────────────────────────────────────
export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return new Array(prices.length).fill(NaN);

  const rsi: number[] = new Array(prices.length).fill(NaN);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  // Initial average gain/loss
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  // Smoothed calculation
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rsi[i + 1] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

// ──────────────────────────────────────────────
// MACD (Moving Average Convergence Divergence)
// ──────────────────────────────────────────────
export interface MACDResult {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
}

export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): MACDResult {
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  const macdLine = prices.map((_, i) => {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) return NaN;
    return fastEMA[i] - slowEMA[i];
  });

  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalFromValid = calculateEMA(validMacd, signalPeriod);

  // Map signal back to original array indices
  const signalLine: number[] = new Array(prices.length).fill(NaN);
  let validIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (!isNaN(macdLine[i])) {
      signalLine[i] = signalFromValid[validIdx] ?? NaN;
      validIdx++;
    }
  }

  const histogram = prices.map((_, i) => {
    if (isNaN(macdLine[i]) || isNaN(signalLine[i])) return NaN;
    return macdLine[i] - signalLine[i];
  });

  return { macdLine, signalLine, histogram };
}

// ──────────────────────────────────────────────
// BOLLINGER BANDS
// ──────────────────────────────────────────────
export interface BollingerBandsResult {
  upper: number[];
  middle: number[];
  lower: number[];
}

export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2,
): BollingerBandsResult {
  const middle = calculateSMA(prices, period);
  const upper: number[] = new Array(prices.length).fill(NaN);
  const lower: number[] = new Array(prices.length).fill(NaN);

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    upper[i] = mean + stdDevMultiplier * stdDev;
    lower[i] = mean - stdDevMultiplier * stdDev;
  }

  return { upper, middle, lower };
}

// ──────────────────────────────────────────────
// ATR (Average True Range)
// ──────────────────────────────────────────────
export function calculateATR(bars: OHLCBar[], period: number = 14): number[] {
  if (bars.length < 2) return new Array(bars.length).fill(NaN);

  const trueRanges: number[] = [bars[0].high - bars[0].low];

  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    trueRanges.push(tr);
  }

  // Use EMA-based smoothing for ATR
  return calculateEMA(trueRanges, period);
}

// ──────────────────────────────────────────────
// VWAP (Volume Weighted Average Price)
// Resets daily — caller must provide bars for one trading session.
// ──────────────────────────────────────────────
export function calculateVWAP(bars: OHLCBar[]): number[] {
  if (bars.length === 0) return [];

  const vwap: number[] = [];
  let cumTypicalPriceVolume = 0;
  let cumVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumTypicalPriceVolume += typicalPrice * bar.volume;
    cumVolume += bar.volume;
    vwap.push(cumVolume === 0 ? NaN : cumTypicalPriceVolume / cumVolume);
  }
  return vwap;
}

// ──────────────────────────────────────────────
// VOLUME SPIKE DETECTION
// ──────────────────────────────────────────────
export function detectVolumeSpikes(
  volumes: number[],
  smaPeriod: number = 20,
  threshold: number = 2.0,
): boolean[] {
  const sma = calculateSMA(volumes, smaPeriod);
  return volumes.map((vol, i) => {
    if (isNaN(sma[i]) || sma[i] === 0) return false;
    return vol >= sma[i] * threshold;
  });
}

// ──────────────────────────────────────────────
// BREAKOUT DETECTION
// Detects when price closes above the highest high or below the lowest low
// of the lookback window.
// ──────────────────────────────────────────────
export interface BreakoutResult {
  detected: boolean;
  type: 'resistance' | 'support' | null;
}

export function detectBreakout(bars: OHLCBar[], lookback: number = 20): BreakoutResult {
  if (bars.length < lookback + 1) return { detected: false, type: null };

  const window = bars.slice(-lookback - 1, -1); // Exclude current bar
  const current = bars[bars.length - 1];

  const highestHigh = Math.max(...window.map(b => b.high));
  const lowestLow = Math.min(...window.map(b => b.low));

  if (current.close > highestHigh) return { detected: true, type: 'resistance' };
  if (current.close < lowestLow) return { detected: true, type: 'support' };
  return { detected: false, type: null };
}

// ──────────────────────────────────────────────
// RELATIVE STRENGTH (vs a benchmark series)
// ──────────────────────────────────────────────
export function calculateRelativeStrength(stockPrices: number[], benchmarkPrices: number[]): number[] {
  if (stockPrices.length !== benchmarkPrices.length) {
    return new Array(stockPrices.length).fill(NaN);
  }
  return stockPrices.map((price, i) => {
    if (benchmarkPrices[i] === 0) return NaN;
    return price / benchmarkPrices[i];
  });
}
