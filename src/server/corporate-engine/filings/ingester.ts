/**
 * Corporate Filings Ingestion Engine
 *
 * Pulls NSE corporate events/filings through the nselib data service,
 * persists metadata in PostgreSQL, caches hot pages in Redis, and emits
 * Redis/Kafka-compatible realtime events for downstream parsing and AI work.
 */
import { db } from '../../../lib/db';
import { corporateFilings } from '../../../lib/db/schema';
import { logger } from '../../../lib/logger';
import { redis } from '../../../lib/redis';
import { eventBus as scannerEventBus } from '../../market-engine/scanners/event-bus';
import { nseDataService, NseFilingRecord } from '../../nse/nselib-service';
import { eventBus, RT_CHANNELS } from '../../realtime/event-bus';
import { createEventEnvelope, createTraceContext } from '../../realtime/contracts';

export function classifyFilingCategory(subject: string, rawCategory: string): string {
  const sub = subject.toLowerCase();
  const cat = (rawCategory || '').toLowerCase();

  // 1. Order Win
  if (
    sub.includes('order win') ||
    sub.includes('receipt of order') ||
    sub.includes('awarded contract') ||
    sub.includes('won contract') ||
    sub.includes('successful bid') ||
    sub.includes('work order') ||
    sub.includes('letter of intent') ||
    sub.includes('loi') ||
    sub.includes('contract signed') ||
    sub.includes('securing order') ||
    sub.includes('project award')
  ) {
    return 'Order Win';
  }

  // 2. Dividends
  if (
    sub.includes('dividend') ||
    sub.includes('book closure for dividend') ||
    sub.includes('record date for dividend')
  ) {
    return 'Dividends';
  }

  // 3. Results Announcement Date / Board Meeting scheduled to consider results
  if (
    (sub.includes('board meeting') || sub.includes('meeting of the board')) &&
    (sub.includes('consider') || sub.includes('approve') || sub.includes('scheduled')) &&
    (sub.includes('financial results') || sub.includes('audited results') || sub.includes('unaudited results') || sub.includes('results date') || sub.includes('earnings date'))
  ) {
    return 'Results Announcement Date';
  }

  // 4. Financial Results (Actuals)
  if (
    (cat.includes('financial results') || sub.includes('financial results') || sub.includes('audited results') || sub.includes('unaudited results') || sub.includes('financial performance')) &&
    !sub.includes('intimation of board') &&
    !sub.includes('date of board') &&
    !sub.includes('board meeting scheduled') &&
    !sub.includes('notice of board') &&
    !sub.includes('board meeting to consider')
  ) {
    return 'Financial Results';
  }

  // 5. General Board Meeting
  if (sub.includes('board meeting') || sub.includes('meeting of the board')) {
    return 'Board Meeting';
  }

  // 6. Press Release
  if (
    cat.includes('press release') ||
    cat.includes('media release') ||
    cat.includes('investor presentation') ||
    sub.includes('press release') ||
    sub.includes('investor presentation') ||
    sub.includes('media release')
  ) {
    return 'Press Release';
  }

  if (rawCategory) {
    return rawCategory.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  return 'General Announcement';
}

export class FilingsIngestionEngine {
  private isPollingActive = false;

  startBackgroundPoller() {
    if (this.isPollingActive) return;
    this.isPollingActive = true;
    logger.info('FilingsIngester', 'Starting background corporate filings poller (30-second interval)');
    
    // Poll immediately
    this.pollFilings().catch(err => {
      logger.error('FilingsIngester', 'Initial background filings poll failed', err);
    });

    setInterval(async () => {
      try {
        await this.pollFilings();
      } catch (err) {
        logger.error('FilingsIngester', 'Background filings poll loop failed', err);
      }
    }, 30000); // Check every 30 seconds
  }

  async pollFilings() {
    logger.info('FilingsIngester', 'Polling NSE corporate filings through nselib service');

    try {
      const { filings } = await nseDataService.filings({ limit: 250, offset: 0 });
      let insertedCount = 0;

      for (const filing of filings) {
        const inserted = await this.persistFiling(filing);
        if (inserted) {
          insertedCount++;
          await this.publishFiling(inserted);
        }
      }

      await redis.set('filings:last_poll', new Date().toISOString(), 'EX', 3600);
      await redis.set('filings:last_count', String(filings.length), 'EX', 3600);
      logger.info('FilingsIngester', 'Filings poll complete', { fetched: filings.length, inserted: insertedCount });
    } catch (error) {
      logger.error('FilingsIngester', 'Failed to fetch NSE filings', error);
    }
  }

  async fetchPage(options: {
    symbol?: string | null;
    category?: string | null;
    limit: number;
    offset: number;
    search?: string | null;
  }) {
    const cacheKey = `filings:page:${options.symbol ?? 'all'}:${options.category ?? 'all'}:${options.limit}:${options.offset}:${options.search ?? ''}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const page = await nseDataService.filings(options);
    await redis.set(cacheKey, JSON.stringify(page), 'EX', 120);
    return page;
  }

  private async persistFiling(filing: NseFilingRecord) {
    try {
      // Fetch live price of the symbol at announcement tick
      let priceAtAnnouncement: number | null = null;
      try {
        const quotes = await nseDataService.quotes([filing.symbol]);
        if (quotes && quotes.length > 0) {
          priceAtAnnouncement = quotes[0].price;
        }
      } catch (e) {
        logger.warn('FilingsIngester', `Failed to fetch quote for priceAtAnnouncement on ${filing.symbol}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // Robust exchange domain attachment prefixing
      let cleanPdfUrl = filing.pdfUrl ?? null;
      if (cleanPdfUrl && !cleanPdfUrl.startsWith('http')) {
        const exchange = (filing.exchange || 'NSE').toUpperCase();
        if (exchange === 'BSE') {
          cleanPdfUrl = `https://www.bseindia.com/xml-data/corpfiling/` + cleanPdfUrl.replace(/^\//, '');
        } else {
          cleanPdfUrl = `https://archives.nseindia.com/corporate/` + cleanPdfUrl.replace(/^\//, '');
        }
      }

      const [inserted] = await db.insert(corporateFilings).values({
        exchange: filing.exchange || 'NSE',
        symbol: filing.symbol,
        companyName: filing.companyName || filing.symbol,
        category: classifyFilingCategory(filing.subject, filing.category),
        subject: filing.subject,
        details: filing.details ?? null,
        broadcastDate: new Date(filing.broadcastDate),
        receiptDate: new Date(filing.receiptDate),
        pdfUrl: cleanPdfUrl,
        priceAtAnnouncement: priceAtAnnouncement,
      }).onConflictDoNothing().returning();

      return inserted;
    } catch (error) {
      logger.warn('FilingsIngester', 'Filing persistence skipped', { symbol: filing.symbol, error });
      return null;
    }
  }

  private async publishFiling(filing: typeof corporateFilings.$inferSelect) {
    await scannerEventBus.publish('corporate:filing', filing);

    const envelope = createEventEnvelope(
      'corporate.filing.created',
      filing,
      createTraceContext('filings-ingester'),
    );
    await eventBus.publish(RT_CHANNELS.OPS_TELEMETRY, envelope);
    await redis.publish('corporate:filings', JSON.stringify(filing));
  }
}

export const filingsIngestionEngine = new FilingsIngestionEngine();
