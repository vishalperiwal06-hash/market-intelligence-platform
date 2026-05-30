import { IScanner, ScannerSignal } from '../engine';

export class BreakoutScanner implements IScanner {
  name = 'Breakout Scanner';
  type = 'breakout';
  timeframes = ['5m', '15m', '1h', '1d'];

  async scan(symbol: string, timeframe: string, latestBar: any, indicators: any): Promise<ScannerSignal | null> {
    if (!indicators) return null;

    const { breakoutDetected, breakoutType, bbUpper, bbLower } = indicators;
    const price = latestBar.close;

    if (breakoutDetected && breakoutType) {
      // It's a genuine breakout detected by our pure math indicator
      return {
        symbol,
        signalType: this.type,
        signalName: breakoutType === 'resistance' ? 'Resistance Breakout' : 'Support Breakdown',
        direction: breakoutType === 'resistance' ? 'bullish' : 'bearish',
        timeframe,
        priceAtDetection: price,
        baseConfidence: 80,
      };
    }

    // Bollinger Band squeeze breakout
    if (bbUpper !== null && bbLower !== null) {
      const bandWidth = (bbUpper - bbLower) / bbLower;
      // If bands were tight and price is now outside upper band
      if (bandWidth < 0.05 && price > bbUpper) {
         return {
          symbol,
          signalType: this.type,
          signalName: 'BB Upper Expansion',
          direction: 'bullish',
          timeframe,
          priceAtDetection: price,
          baseConfidence: 75,
        };
      }
    }

    return null;
  }
}
