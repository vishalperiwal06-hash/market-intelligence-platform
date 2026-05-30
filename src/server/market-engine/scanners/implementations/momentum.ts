import { IScanner, ScannerSignal } from '../engine';

export class MomentumScanner implements IScanner {
  name = 'Momentum Scanner';
  type = 'momentum';
  timeframes = ['1m', '5m', '15m', '1h', '1d'];

  async scan(symbol: string, timeframe: string, latestBar: any, indicators: any): Promise<ScannerSignal | null> {
    if (!indicators) return null;

    const { rsi14, macdHistogram, macdLine, macdSignal, ema20, ema50 } = indicators;
    const price = latestBar.close;

    // 1. RSI Bullish Momentum (Crossing above 50 with force)
    if (rsi14 !== null && rsi14 > 55 && rsi14 < 70) {
      if (ema20 && ema50 && ema20 > ema50 && price > ema20) {
        return {
          symbol,
          signalType: this.type,
          signalName: 'RSI Bullish Momentum',
          direction: 'bullish',
          timeframe,
          priceAtDetection: price,
          baseConfidence: 70,
          metadata: { rsi: rsi14 },
        };
      }
    }

    // 2. MACD Crossover Bullish
    if (macdHistogram !== null && macdHistogram > 0 && macdLine !== null && macdSignal !== null) {
      // Very crude check for recent cross (histogram just flipped positive)
      // In a real system, you'd compare current vs previous histogram
      if (macdHistogram < 0.5 && macdLine < 0) { // crossing up below zero line
         return {
          symbol,
          signalType: this.type,
          signalName: 'MACD Bullish Cross',
          direction: 'bullish',
          timeframe,
          priceAtDetection: price,
          baseConfidence: 75,
          metadata: { macdHistogram },
        };
      }
    }

    // 3. RSI Oversold Reversal
    if (rsi14 !== null && rsi14 < 30) {
        return {
          symbol,
          signalType: this.type,
          signalName: 'RSI Oversold',
          direction: 'bullish', // contrarian
          timeframe,
          priceAtDetection: price,
          baseConfidence: 60,
          metadata: { rsi: rsi14 },
        };
    }

    return null;
  }
}
