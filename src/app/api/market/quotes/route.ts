import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { companies } from '@/lib/db/schema';
import { nseDataService } from '@/server/nse/nselib-service';
import { redis } from '@/lib/redis';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 4000);

    // Fetch all active companies from PostgreSQL
    const dbCompanies = await db.select({ 
      symbol: companies.symbol, 
      name: companies.name, 
      sector: companies.sector 
    })
      .from(companies)
      .where(eq(companies.isActive, true));

    const symbols = dbCompanies
      .map(c => c.symbol?.toUpperCase().trim())
      .filter((sym): sym is string => !!sym && sym.length <= 15 && /^[A-Z0-9&-]+$/.test(sym))
      .slice(0, limit);

    if (symbols.length === 0) {
      return NextResponse.json({
        ok: true,
        data: [],
        meta: { count: 0, source: 'database', note: 'No active companies seeded in database yet' },
      });
    }

    // Build a name/sector lookup from DB for enrichment
    const companyLookup = new Map<string, { name: string; sector: string | null }>();
    for (const c of dbCompanies) {
      if (c.symbol) companyLookup.set(c.symbol.toUpperCase().trim(), { name: c.name, sector: c.sector });
    }

    let quotes: any[] = [];
    let source = 'unknown';

    // Strategy 1: Try NSE data service (Python backend)
    try {
      const batchSize = 50;
      const batchSymbols = symbols.slice(0, batchSize);
      const nseQuotes = await nseDataService.quotes(batchSymbols);
      if (nseQuotes && nseQuotes.length > 0) {
        quotes = nseQuotes;
        source = 'nse-data-service';
      }
    } catch {
      // NSE service down — expected on Render free tier
    }

    // Strategy 2: Read from Redis cache (populated by market pipeline)
    if (quotes.length === 0) {
      try {
        const pipe = redis.pipeline();
        const batchSymbols = symbols.slice(0, limit);
        for (const sym of batchSymbols) {
          pipe.hgetall(`market:tick:${sym}`);
        }
        const results = await pipe.exec();
        if (results) {
          for (let i = 0; i < results.length; i++) {
            const [err, data] = results[i] as [Error | null, Record<string, string>];
            if (!err && data && data.price && parseFloat(data.price) > 0) {
              const sym = batchSymbols[i];
              const info = companyLookup.get(sym);
              quotes.push({
                symbol: sym,
                name: info?.name || sym,
                sector: info?.sector || null,
                price: parseFloat(data.price),
                change: parseFloat(data.change || '0'),
                changePercent: parseFloat(data.changePercent || '0'),
                volume: parseInt(data.volume || '0', 10),
                turnover: parseFloat(data.turnover || '0'),
                high: parseFloat(data.high || data.price),
                low: parseFloat(data.low || data.price),
                open: parseFloat(data.open || data.price),
                close: parseFloat(data.close || data.price),
                exchange: data.exchange || 'NSE',
                timestamp: data.timestamp || new Date().toISOString(),
                source: data.source || 'pipeline-cache',
              });
            }
          }
        }
        if (quotes.length > 0) source = 'redis-cache';
      } catch {
        // Redis unavailable
      }
    }

    // Strategy 3: Return company list with null prices (zero-fabrication — data not available yet)
    if (quotes.length === 0) {
      quotes = symbols.slice(0, 100).map(sym => {
        const info = companyLookup.get(sym);
        return {
          symbol: sym,
          name: info?.name || sym,
          sector: info?.sector || null,
          price: null,
          change: null,
          changePercent: null,
          volume: null,
          turnover: null,
          high: null,
          low: null,
          open: null,
          close: null,
          exchange: 'NSE',
          timestamp: new Date().toISOString(),
          source: 'database-only',
        };
      });
      source = 'database-only';
    }

    // Enrich with company names from DB
    for (const q of quotes) {
      if (!q.name || q.name === q.symbol) {
        const info = companyLookup.get(q.symbol);
        if (info) {
          q.name = info.name;
          q.sector = info.sector;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: quotes,
      meta: {
        count: quotes.length,
        totalCompanies: symbols.length,
        source,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'QUOTES_FETCH_FAILED',
          message: 'Failed to retrieve market quotes',
          details: error.message,
        },
      },
      { status: 500 }
    );
  }
}
