/**
 * Financial News RSS Ingestion Engine
 * 
 * Fetches news from Moneycontrol, Mint, Economic Times, etc.
 * Normalizes, classifies, deduplicates, and saves to the database.
 */
import Parser from 'rss-parser';
import { db } from '../../../lib/db';
import { newsArticles } from '../../../lib/db/schema';
import { logger } from '../../../lib/logger';
import { eventBus } from '../../market-engine/scanners/event-bus';

const parser = new Parser();

const RSS_SOURCES = [
  { name: 'Moneycontrol', url: 'https://www.moneycontrol.com/rss/MCtopnews.xml' },
  { name: 'Mint', url: 'https://www.livemint.com/rss/markets' },
  { name: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { name: 'CNBC', url: 'https://www.cnbctv18.com/api/v1/rss/market' }
];

export class NewsIngestionEngine {
  
  async pollAllSources() {
    logger.info('NewsIngester', 'Polling financial RSS feeds...');
    for (const source of RSS_SOURCES) {
      await this.pollSource(source);
    }
  }

  private async pollSource(source: { name: string, url: string }) {
    try {
      const feed = await parser.parseURL(source.url);
      
      for (const item of feed.items) {
        if (!item.title || !item.link) continue;
        
        // 1. Timestamp Normalization
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
        
        // 2. Classification & Tagging Engine (Basic keyword matching for now)
        const category = this.classifyNews(item.title + ' ' + (item.contentSnippet || ''));
        const matchedSymbols = this.tagCompanies(item.title + ' ' + (item.contentSnippet || ''));

        // 3. Deduplication (Unique Constraint on Link in DB)
        try {
          const [inserted] = await db.insert(newsArticles).values({
            source: source.name,
            title: item.title,
            description: item.contentSnippet || '',
            link: item.link,
            pubDate,
            category,
            symbols: matchedSymbols.length > 0 ? matchedSymbols : null,
          }).onConflictDoNothing({ target: newsArticles.link }).returning();

          if (inserted) {
            logger.debug('NewsIngester', `New Article: [${source.name}] ${item.title}`);
            // Fire event so AI can summarize breaking news if needed
            await eventBus.publish('corporate:news', inserted);
          }
        } catch (dbErr) {
          // Ignore unique constraint violations if not caught by onConflictDoNothing
        }
      }
    } catch (err) {
      logger.error('NewsIngester', `Failed to poll ${source.name}`, err);
    }
  }

  private classifyNews(text: string): string {
    const t = text.toLowerCase();
    if (t.includes('q1') || t.includes('q2') || t.includes('q3') || t.includes('q4') || t.includes('earnings') || t.includes('net profit')) return 'Earnings';
    if (t.includes('rbi') || t.includes('repo rate') || t.includes('inflation') || t.includes('gdp')) return 'Macro';
    if (t.includes('fed') || t.includes('us market') || t.includes('dow jones') || t.includes('nasdaq')) return 'Global';
    if (t.includes('dividend') || t.includes('bonus') || t.includes('split')) return 'Corporate Action';
    return 'General Market';
  }

  private tagCompanies(text: string): string[] {
    const t = text.toUpperCase();
    const tags: string[] = [];
    // Basic logic - in a real app, use the SymbolMaster with Aho-Corasick or Regex boundaries
    const majorCompanies = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ITC', 'SBI'];
    for (const c of majorCompanies) {
      if (t.includes(c)) tags.push(c);
    }
    return tags;
  }
}

export const newsIngestionEngine = new NewsIngestionEngine();
