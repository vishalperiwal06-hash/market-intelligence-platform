/**
 * Scanner Engine Core
 * 
 * Manages scanner execution, deduplication, and signal emission.
 */
import { redis } from '../../../lib/redis';
import { db } from '../../../lib/db';
import { activeSignals, signalHistory } from '../../../lib/db/schema';
import { eventBus } from './event-bus';
import { logger } from '../../../lib/logger';
import { eq, and } from 'drizzle-orm';

export interface ScannerSignal {
  symbol: string;
  signalType: string;
  signalName: string;
  direction: 'bullish' | 'bearish';
  timeframe: string;
  priceAtDetection: number;
  baseConfidence: number; // 0-100 base score from scanner logic
  metadata?: any;
}

export interface IScanner {
  name: string;
  type: string;
  timeframes: string[];
  scan(symbol: string, timeframe: string, latestBar: any, indicators: any): Promise<ScannerSignal | null>;
}

export class ScannerEngine {
  private scanners: IScanner[] = [];

  register(scanner: IScanner) {
    this.scanners.push(scanner);
    logger.info('ScannerEngine', `Registered scanner: ${scanner.name}`);
  }

  getScanners() {
    return this.scanners;
  }

  /**
   * Process a generated signal:
   * 1. Check deduplication (cooldown)
   * 2. Apply Scoring
   * 3. Persist to DB
   * 4. Emit via EventBus
   */
  async processSignal(signal: ScannerSignal, context: any) {
    const { symbol, signalType, signalName, timeframe } = signal;
    
    // 1. Deduplication (cooldown: e.g. don't fire same signal on same timeframe for 1 hour)
    const dedupKey = `signal:dedup:${symbol}:${signalType}:${signalName}:${timeframe}`;
    const exists = await redis.exists(dedupKey);
    if (exists) return; // Skip, already fired recently

    // Cooldown duration depends on timeframe
    let cooldownSeconds = 3600; // 1h default
    if (timeframe === '1m') cooldownSeconds = 300; // 5m
    if (timeframe === '5m') cooldownSeconds = 900; // 15m
    if (timeframe === '15m') cooldownSeconds = 3600; // 1h
    if (timeframe === '1h') cooldownSeconds = 14400; // 4h
    if (timeframe === '1d') cooldownSeconds = 86400; // 24h

    await redis.set(dedupKey, '1', 'EX', cooldownSeconds);

    // 2. We assume the caller (Scanner Worker) has calculated the scoring context, 
    // or we use the base confidence for now.
    // Real implementation would use calculateSignalScore here.
    const confidence = signal.baseConfidence;
    const qualityScore = confidence; 
    const riskScore = 50;

    const expiresAt = new Date(Date.now() + (cooldownSeconds * 1000));

    const dbPayload = {
      symbol,
      signalType,
      signalName,
      direction: signal.direction,
      timeframe,
      confidence,
      qualityScore,
      riskScore,
      priceAtDetection: signal.priceAtDetection,
      metadata: signal.metadata,
      expiresAt,
    };

    try {
      // 3. Persist
      await db.insert(activeSignals).values(dbPayload).onConflictDoUpdate({
        target: [activeSignals.symbol, activeSignals.signalType, activeSignals.signalName, activeSignals.timeframe],
        set: dbPayload,
      });

      await db.insert(signalHistory).values({
        symbol,
        signalType,
        signalName,
        direction: signal.direction,
        timeframe,
        confidence,
        priceAtDetection: signal.priceAtDetection,
      });

      // 4. Emit
      await eventBus.publish('signal:new', dbPayload);
      logger.info('ScannerEngine', `Fired signal: ${symbol} ${signalName} (${timeframe})`);

      // 5. Enqueue AI Explanation (only for high confidence signals to save tokens)
      if (confidence >= 60) {
        // Need to import enqueueSignalExplanation at top, let's use dynamic import to avoid circular issues
        const { enqueueSignalExplanation } = await import('../../ai-engine/queues/producer');
        await enqueueSignalExplanation(symbol, `${symbol}-${signalType}-${timeframe}-${Date.now()}`, signalName, { price: signal.priceAtDetection, ...context });
      }

    } catch (err) {
      logger.error('ScannerEngine', 'Failed to process signal', err);
    }
  }
}

export const scannerEngine = new ScannerEngine();
