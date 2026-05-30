/**
 * Parsing Queue — BullMQ Worker
 *
 * Processes document parsing jobs asynchronously.
 * Concurrency is kept low (1) because each parse job is I/O + AI intensive.
 */
import { Worker, Job } from 'bullmq';
import { parsingOrchestrator } from '../parser/orchestrator';
import { logger } from '../../../lib/logger';
import { redis } from '../../../lib/redis';

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

export const parsingWorker = new Worker('parsing-queue', async (job: Job) => {
  const { filingId, symbol, filePath, filingCategory } = job.data;
  logger.info('ParsingWorker', `Processing parse job ${job.id}: ${symbol} [${filingCategory}]`);

  // Track active parsing jobs for observability
  await redis.hincrby('parsing:diagnostics', 'jobs_started', 1);

  const result = await parsingOrchestrator.processDocument(filingId, symbol, filePath);

  // Update diagnostics
  await redis.hincrby('parsing:diagnostics', 'jobs_completed', 1);
  if (result.validationErrors.length > 0) {
    await redis.hincrby('parsing:diagnostics', 'jobs_with_errors', 1);
  }

  return result;
}, {
  connection,
  concurrency: 1, // One parse job at a time — each is AI-heavy
});

parsingWorker.on('completed', (job) => {
  logger.debug('ParsingWorker', `Job ${job.id} completed`);
});

parsingWorker.on('failed', async (job, err) => {
  logger.error('ParsingWorker', `Job ${job?.id} failed`, err);
  redis.hincrby('parsing:diagnostics', 'jobs_failed', 1).catch(() => {});
  if (job) {
    const attempts = job.opts?.attempts || 1;
    if (job.attemptsMade >= attempts) {
      try {
        const deadLetterItem = {
          queue: 'parsing-queue',
          workerName: 'ParsingWorker',
          jobId: job.id,
          name: job.name,
          data: job.data,
          failedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
          attemptsMade: job.attemptsMade,
        };
        await redis.rpush('queue:dead-letter', JSON.stringify(deadLetterItem));
        logger.warn('ParsingWorker', `Job ${job.id} quarantine to dead-letter success`);
      } catch (dlErr) {
        logger.error('ParsingWorker', `Failed to quarantine job ${job.id}`, dlErr);
      }
    }
  }
});
