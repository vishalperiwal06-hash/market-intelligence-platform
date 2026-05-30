/**
 * AI Engine Queue Producer
 * 
 * Allows the Scanner Engine and other synchronous systems to easily dispatch
 * async jobs to the AI Engine.
 */
import { Queue } from 'bullmq';
import { logger } from '../../../lib/logger';

const connection = (() => {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port || '6379'),
        username: url.username || undefined,
        password: url.password || undefined,
      };
    } catch (e) {
      // ignore parsing error, fallback
    }
  }
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };
})();

export const aiQueue = new Queue('ai-engine-queue', { connection });

export async function enqueueSignalExplanation(symbol: string, signalId: string, signalType: string, context: any) {
  logger.debug('AIQueue', `Enqueuing explain-signal for ${symbol} - ${signalType}`);
  await aiQueue.add('explain-signal', {
    symbol,
    signalId,
    signalType,
    context
  }, {
    priority: 1, // High priority
    removeOnComplete: true,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });
}

export async function enqueueMarketNarrative() {
  logger.debug('AIQueue', 'Enqueuing generate-market-narrative');
  await aiQueue.add('generate-market-narrative', {}, {
    priority: 2, // Medium priority
    removeOnComplete: true,
    attempts: 2
  });
}
