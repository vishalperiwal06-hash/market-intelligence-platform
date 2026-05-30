/**
 * Realtime Scanner Worker
 * 
 * Subscribes to new candles being generated, fetches their precomputed indicators,
 * and runs all registered scanners to detect market events.
 */
import { redis } from '../../../lib/redis';
import { logger } from '../../../lib/logger';
import { scannerEngine } from '../scanners/engine';
import { MomentumScanner } from '../scanners/implementations/momentum';
import { BreakoutScanner } from '../scanners/implementations/breakout';
import { VolumeScanner } from '../scanners/implementations/volume';
import { rankingEngine } from '../scanners/ranking';

export class ScannerWorker {
  private isRunning = false;

  constructor() {
    // Register scanners
    scannerEngine.register(new MomentumScanner());
    scannerEngine.register(new BreakoutScanner());
    scannerEngine.register(new VolumeScanner());
  }

  async runScanCycle(timeframe: string) {
    logger.debug('ScannerWorker', `Starting scan cycle for ${timeframe}`);
    
    // We get the list of symbols from Redis where candles are active
    const keys = await redis.keys(`candle:${timeframe}:*`);
    if (keys.length === 0) return;

    for (const key of keys) {
      const symbol = key.split(':')[2];
      
      try {
        // Get the latest candle
        const candleStr = await redis.hget(key, 'latest');
        if (!candleStr) continue;
        const latestBar = JSON.parse(candleStr);
        // Rename for standard format
        const bar = { open: latestBar.o, high: latestBar.h, low: latestBar.l, close: latestBar.c, volume: latestBar.v };

        // Get the precomputed indicators
        const indStr = await redis.get(`indicator:${timeframe}:${symbol}`);
        if (!indStr) continue; // If no indicators are precomputed, we can't scan
        const indicators = JSON.parse(indStr);

        // Calculate scoring context here (simplified for now)
        // In reality, we'd fetch market breadth and sector strength from Redis
        const context = {
          volumeSmaRatio: indicators.volumeSma20 ? (bar.volume / indicators.volumeSma20) : 1,
          isTrendAligned: indicators.ema50 ? (bar.close > indicators.ema50) : true,
        };

        // Run all registered scanners for this timeframe
        const scanners = scannerEngine.getScanners().filter(s => s.timeframes.includes(timeframe));
        
        for (const scanner of scanners) {
          const signal = await scanner.scan(symbol, timeframe, bar, indicators);
          if (signal) {
            await scannerEngine.processSignal(signal, context);
          }
        }
      } catch (err) {
        logger.error('ScannerWorker', `Error scanning ${symbol} on ${timeframe}`, err);
      }
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('ScannerWorker', 'Starting scanner worker loops');

    // Run scans slightly after OHLC aggregation finishes
    setInterval(() => this.runScanCycle('1m'), 15_000);
    setInterval(() => this.runScanCycle('5m'), 60_000);
    setInterval(() => this.runScanCycle('15m'), 180_000);
    setInterval(() => this.runScanCycle('1h'), 300_000);
    setInterval(() => this.runScanCycle('1d'), 600_000);

    // Run Ranking Engine every 1 minute
    setInterval(async () => {
      try {
        await rankingEngine.computeRankings();
        // Generate AI Market Narrative every 5 minutes (rough heuristic: rand)
        // For demonstration, let's trigger it here if minute % 5 === 0
        if (new Date().getMinutes() % 5 === 0) {
          const { enqueueMarketNarrative } = await import('../../ai-engine/queues/producer');
          await enqueueMarketNarrative();
        }
      } catch (e) {
        logger.error('ScannerWorker', 'Ranking fail', e);
      }
    }, 60_000);
  }

  stop() {
    this.isRunning = false;
  }
}

export const scannerWorker = new ScannerWorker();
