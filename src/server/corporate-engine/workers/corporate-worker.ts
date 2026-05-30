/**
 * Corporate Worker
 * 
 * Periodically polls external news and filings sources.
 */
import { newsIngestionEngine } from '../news/rss-ingester';
import { filingsIngestionEngine } from '../filings/ingester';
import { logger } from '../../../lib/logger';

export class CorporateWorker {
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('CorporateWorker', 'Starting corporate intelligence workers');

    // Poll News every 5 minutes
    setInterval(() => {
      newsIngestionEngine.pollAllSources().catch(e => logger.error('CorporateWorker', 'News poll failed', e));
    }, 300_000);

    // Poll Filings every 2 minutes
    setInterval(() => {
      filingsIngestionEngine.pollFilings().catch(e => logger.error('CorporateWorker', 'Filings poll failed', e));
    }, 120_000);
  }

  stop() {
    this.isRunning = false;
    logger.info('CorporateWorker', 'Stopping corporate intelligence workers');
  }
}

export const corporateWorker = new CorporateWorker();
