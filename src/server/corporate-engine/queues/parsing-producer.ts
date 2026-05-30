/**
 * Parsing Queue — BullMQ Producer
 *
 * Allows the Filings Ingester and other systems to enqueue
 * documents for asynchronous parsing without blocking the main loop.
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

export const parsingQueue = new Queue('parsing-queue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: { count: 200 }, // Keep last 200 failed for diagnostics
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

/** Priority tiers for parsing queue */
const PRIORITY: Record<string, number> = {
  'Financial Results': 1,
  'Concall Transcripts': 1,
  'Annual Reports': 2,
  'Investor Presentations': 2,
  'Board Meeting': 3,
  'Dividends': 4,
  'General Announcement': 5,
};

export async function enqueueDocumentParsing(
  filingId: string,
  symbol: string,
  filePath: string,
  filingCategory: string
) {
  const priority = PRIORITY[filingCategory] ?? 5;
  logger.info('ParsingQueue', `Enqueuing parse job for ${symbol} [${filingCategory}] priority=${priority}`);
  await parsingQueue.add('parse-document', {
    filingId,
    symbol,
    filePath,
    filingCategory,
  }, { priority });
}
