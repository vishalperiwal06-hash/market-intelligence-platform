import { IScanner, ScannerSignal } from '../engine';

export class VolumeScanner implements IScanner {
  name = 'Volume Scanner';
  type = 'volume';
  timeframes = ['5m', '15m', '1h', '1d'];

  async scan(symbol: string, timeframe: string, latestBar: any, indicators: any): Promise<ScannerSignal | null> {
    if (!indicators) return null;

    const { volumeSpike, volumeSma20 } = indicators;
    const { close, open, volume } = latestBar;

    if (volumeSpike && volumeSma20) {
      const ratio = volume / volumeSma20;
      const isGreen = close >= open;

      return {
        symbol,
        signalType: this.type,
        signalName: isGreen ? 'Accumulation Volume Spike' : 'Distribution Volume Spike',
        direction: isGreen ? 'bullish' : 'bearish',
        timeframe,
        priceAtDetection: close,
        baseConfidence: Math.min(60 + (ratio * 10), 95), // Confidence scales with spike size
        metadata: { ratio },
      };
    }

    return null;
  }
}
