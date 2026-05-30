/**
 * Technical Indicator Background Worker
 *
 * Continuously precomputes indicators from genuine OHLC candle data.
 * Never calculates from frontend requests — always reads from pre-warmed cache.
 * If insufficient candle history exists, the indicator value is stored as null.
 */
import { db } from '../../../lib/db';
import { ohlcCandles, technicalIndicators } from '../../../lib/db/schema';
import { redis, acquireLock, releaseLock } from '../../../lib/redis';
import { logger } from '../../../lib/logger';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateVWAP,
  calculateSMA,
  detectVolumeSpikes,
  detectBreakout,
  type OHLCBar,
} from '../indicators/calculations';

const COMPUTATION_TIMEFRAMES = ['1d', '1h', '15m', '5m'] as const;
const LOOKBACK_BARS = 250; // Enough for EMA200 + buffer

interface IndicatorSnapshot {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  vwap: number | null;
  atr14: number | null;
  relativeStrength: number | null;
  volumeSma20: number | null;
  volumeSpike: boolean;
  breakoutDetected: boolean;
  breakoutType: string | null;
}

export class IndicatorWorker {
  private isRunning = false;

  /**
   * Fetch recent OHLC bars for a symbol+timeframe from Postgres.
   */
  private async fetchCandles(symbol: string, timeframe: string, limit: number = LOOKBACK_BARS): Promise<OHLCBar[]> {
    const rows = await db
      .select({
        open: ohlcCandles.open,
        high: ohlcCandles.high,
        low: ohlcCandles.low,
        close: ohlcCandles.close,
        volume: ohlcCandles.volume,
        bucketStart: ohlcCandles.bucketStart,
      })
      .from(ohlcCandles)
      .where(and(
        eq(ohlcCandles.symbol, symbol),
        eq(ohlcCandles.timeframe, timeframe),
      ))
      .orderBy(desc(ohlcCandles.bucketStart))
      .limit(limit);

    // Reverse to chronological order (oldest first)
    return rows.reverse().map(r => ({
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: Number(r.volume ?? 0),
      timestamp: r.bucketStart.toISOString(),
    }));
  }

  /**
   * Compute all indicators for a single symbol + timeframe.
   */
  async computeForSymbol(symbol: string, timeframe: string): Promise<IndicatorSnapshot | null> {
    const bars = await this.fetchCandles(symbol, timeframe);
    if (bars.length === 0) return null;

    const closes = bars.map(b => b.close);
    const volumes = bars.map(b => b.volume);

    // Moving Averages
    const ema20Arr = calculateEMA(closes, 20);
    const ema50Arr = calculateEMA(closes, 50);
    const ema200Arr = calculateEMA(closes, 200);

    // RSI
    const rsiArr = calculateRSI(closes, 14);

    // MACD
    const macd = calculateMACD(closes);

    // Bollinger Bands
    const bb = calculateBollingerBands(closes, 20, 2);

    // ATR
    const atrArr = calculateATR(bars, 14);

    // VWAP — only meaningful for intraday candles
    let vwapVal: number | null = null;
    if (timeframe !== '1d') {
      const vwapArr = calculateVWAP(bars);
      const lastVwap = vwapArr[vwapArr.length - 1];
      vwapVal = isNaN(lastVwap) ? null : lastVwap;
    }

    // Volume SMA + spike
    const volSma = calculateSMA(volumes, 20);
    const spikes = detectVolumeSpikes(volumes, 20, 2.0);

    // Breakout
    const breakout = detectBreakout(bars, 20);

    // Extract latest value, converting NaN to null for DB storage
    const last = (arr: number[]) => {
      const v = arr[arr.length - 1];
      return (v === undefined || isNaN(v)) ? null : v;
    };

    return {
      ema20: last(ema20Arr),
      ema50: last(ema50Arr),
      ema200: last(ema200Arr),
      rsi14: last(rsiArr),
      macdLine: last(macd.macdLine),
      macdSignal: last(macd.signalLine),
      macdHistogram: last(macd.histogram),
      bbUpper: last(bb.upper),
      bbMiddle: last(bb.middle),
      bbLower: last(bb.lower),
      vwap: vwapVal,
      atr14: last(atrArr),
      relativeStrength: null, // Computed separately when benchmark data is available
      volumeSma20: last(volSma),
      volumeSpike: spikes.length > 0 ? spikes[spikes.length - 1] : false,
      breakoutDetected: breakout.detected,
      breakoutType: breakout.type,
    };
  }

  /**
   * Get all distinct symbols that have candle data.
   */
  private async getActiveSymbols(): Promise<string[]> {
    const result = await db.execute(
      sql`SELECT DISTINCT symbol FROM ohlc_candles`
    );
    return (result as any[]).map(r => r.symbol);
  }

  /**
   * Full computation cycle: iterates every active symbol × every timeframe.
   */
  async runComputationCycle(): Promise<void> {
    const lockKey = 'lock:indicator:computation';
    const ownerToken = `indicator:${Math.random().toString(36).substring(2, 11)}`;
    const acquired = await acquireLock(lockKey, ownerToken, 60000); // 1-minute TTL
    if (!acquired) {
      logger.debug('IndicatorWorker', 'Indicator computation already running or handled by another instance');
      return;
    }

    try {
      const symbols = await this.getActiveSymbols();
      if (symbols.length === 0) {
        logger.debug('IndicatorWorker', 'No symbols with candle data yet — skipping cycle');
        return;
      }

      let computed = 0;
      const now = new Date();

      for (const tf of COMPUTATION_TIMEFRAMES) {
        for (const symbol of symbols) {
          try {
            const snapshot = await this.computeForSymbol(symbol, tf);
            if (!snapshot) continue;

            // Persist to Postgres
            await db.insert(technicalIndicators).values({
              symbol,
              timeframe: tf,
              timestamp: now,
              ...snapshot,
            }).onConflictDoUpdate({
              target: [technicalIndicators.symbol, technicalIndicators.timeframe, technicalIndicators.timestamp],
              set: snapshot,
            });

            // Cache in Redis for instant reads
            const cacheKey = `indicator:${tf}:${symbol}`;
            await redis.set(cacheKey, JSON.stringify(snapshot), 'EX', 120); // 2 min TTL

            computed++;
          } catch (error) {
            logger.error('IndicatorWorker', `Failed to compute indicators for ${symbol}:${tf}`, error);
          }
        }
      }

      logger.info('IndicatorWorker', `Computed indicators for ${computed} symbol-timeframe pairs`, {
        symbols: symbols.length,
        timeframes: COMPUTATION_TIMEFRAMES.length,
      });
    } finally {
      await releaseLock(lockKey, ownerToken);
    }
  }

  /**
   * Start the continuous background loop.
   */
  start(intervalMs: number = 30_000) {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('IndicatorWorker', `Starting indicator worker (interval: ${intervalMs}ms)`);
    this.loop(intervalMs);
  }

  stop() {
    this.isRunning = false;
  }

  private async loop(intervalMs: number) {
    while (this.isRunning) {
      const start = Date.now();
      try {
        await this.runComputationCycle();
      } catch (err) {
        logger.error('IndicatorWorker', 'Computation cycle failed', err);
      }
      const elapsed = Date.now() - start;
      const sleepMs = Math.max(intervalMs - elapsed, 1000);
      await new Promise(r => setTimeout(r, sleepMs));
    }
  }
}

export const indicatorWorker = new IndicatorWorker();
