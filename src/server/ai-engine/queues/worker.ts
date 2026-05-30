/**
 * AI Engine Queue Worker (BullMQ)
 * 
 * Listens for jobs in Redis and processes them asynchronously
 * so the main market ingestion loop is never blocked by AI latency.
 */
import { Worker, Job } from 'bullmq';
import { signalExplainer } from '../explainers/signal-explainer';
import { marketNarrativeEngine } from '../narratives/market-narrative';
import { logger } from '../../../lib/logger';

// Redis connection config used by BullMQ
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

export const aiWorker = new Worker('ai-engine-queue', async (job: Job) => {
  logger.info('AIWorker', `Processing job ${job.id} of type ${job.name}`);
  
  switch (job.name) {
    case 'explain-signal': {
      const { symbol, signalId, signalType, context } = job.data;
      await signalExplainer.explainSignal(symbol, signalId, signalType, context);
      break;
    }
    
    case 'generate-market-narrative': {
      await marketNarrativeEngine.generateNarrative();
      break;
    }

    default:
      logger.warn('AIWorker', `Unknown job type: ${job.name}`);
  }
}, {
  connection,
  concurrency: 2, // Process max 2 AI jobs concurrently to avoid API rate limits
});

import { redis } from '../../../lib/redis';

aiWorker.on('completed', (job) => {
  logger.debug('AIWorker', `Job ${job.id} completed`);
});

aiWorker.on('failed', async (job, err) => {
  logger.error('AIWorker', `Job ${job?.id} failed`, err);
  if (job) {
    const attempts = job.opts?.attempts || 1;
    if (job.attemptsMade >= attempts) {
      try {
        const deadLetterItem = {
          queue: 'ai-engine-queue',
          workerName: 'AIWorker',
          jobId: job.id,
          name: job.name,
          data: job.data,
          failedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
          attemptsMade: job.attemptsMade,
        };
        await redis.rpush('queue:dead-letter', JSON.stringify(deadLetterItem));
        logger.warn('AIWorker', `Job ${job.id} quarantine to dead-letter success`);
      } catch (dlErr) {
        logger.error('AIWorker', `Failed to quarantine job ${job.id}`, dlErr);
      }
    }
  }
});
