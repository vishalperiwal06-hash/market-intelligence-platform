import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { companies } from '@/lib/db/schema';
import { nseDataService } from '@/server/nse/nselib-service';
import { redis } from '@/lib/redis';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 4000);

    // Fetch active companies
    const dbCompanies = await db.select({ 
      symbol: companies.symbol, 
      name: companies.name, 
      sector: companies.sector,
      marketCap: companies.marketCap
    })
      .from(companies)
      .where(eq(companies.isActive, true));

    // Curated top active liquid Indian stocks to ensure they are prioritised first
    const curatedActiveSymbols = [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
      'LT', 'BAJFINANCE', 'ASIANPAINT', 'AXISBANK', 'MARUTI', 'HCLTECH', 'WIPRO', 'TITAN', 'SUNPHARMA', 'ULTRACEMCO',
      'TECHM', 'BAJAJFINSV', 'POWERGRID', 'NTPC', 'ONGC', 'M&M', 'JSWSTEEL', 'TATAMOTORS', 'TATASTEEL', 'ADANIENT',
      'ADANIPORTS', 'ADANIPOWER', 'ADANIGREEN', 'COALINDIA', 'DIVISLAB', 'DRREDDY', 'CIPLA', 'BPCL', 'HEROMOTOCO', 'GRASIM',
      'APOLLOHOSP', 'TATACONSUM', 'EICHERMOT', 'INDUSINDBK', 'NESTLEIND', 'BRITANNIA', 'SHREECEM', 'HINDALCO', 'HAL', 'BEL',
      'TRENT', 'MCX', 'ZOMATO', 'DMART', 'PNB', 'BANKBARODA', 'IOC', 'IRFC', 'RVNL', 'IREDA', 'PFC',
      'REC', 'YESBANK', 'IDFCFIRSTB', 'BANDHANBNK', 'LICI', 'VEDL', 'TVSMOTOR', 'ASHOKLEY', 'DABUR', 'MARICO',
      'COLPAL', 'POLYCAB', 'HAVELLS', 'SUZLON', 'JIOFIN', 'AWFIS', 'TATACOMM', 'IDEA', 'GAIL', 'SAIL',
      'NHPC', 'NMDC', 'IRCTC', 'UNIONBANK', 'CANBK', 'OBEROIRLTY', 'DLF', 'PRESTIGE', 'NYKAA', 'PAYTM', 'MUTHOOTFIN',
      'TATAELXSI', 'PERSISTENT', 'COFORGE', 'KPITTECH', 'DIXON', 'KAYNES', 'IRCON', 'RAILTEL', 'SJVN', 'GENUSPOWER',
      'MAZDOCK', 'COCHINSHIP', 'GRSE', 'BEML', 'HUDCO', 'NBCC', 'GMRINFRA', 'JINDALSTEL', 'HINDZINC',
      'NATIONALUM', 'TATACHEM', 'DEEPAKCTR', 'AARTIIND', 'SRF', 'PEL', 'MANAPPURAM', 'LICHSGFIN', 'IBULHSGFIN', 'INDIANB', 'BOB'
    ];

    const dbSymbols = dbCompanies
      .map(c => c.symbol?.toUpperCase().trim())
      .filter((sym): sym is string => !!sym && sym.length <= 15 && /^[A-Z0-9&-]+$/.test(sym));

    // Combine symbols putting the highly active liquid ones first
    const symbols = [
      ...curatedActiveSymbols,
      ...dbSymbols.filter(sym => !curatedActiveSymbols.includes(sym))
    ].slice(0, limit);

    if (symbols.length === 0) {
      return NextResponse.json({
        ok: true,
        data: [],
        meta: { count: 0, source: 'database', note: 'No active companies seeded in database yet' },
      });
    }

    // Build a name/sector lookup from DB for enrichment
    const companyLookup = new Map<string, { name: string; sector: string | null; marketCap: number | null }>();
    for (const c of dbCompanies) {
      if (c.symbol) companyLookup.set(c.symbol.toUpperCase().trim(), { name: c.name, sector: c.sector, marketCap: c.marketCap });
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

    // Strategy 2.5: Direct Yahoo Finance fetch (on-demand fallback)
    if (quotes.length === 0) {
      try {
        const { default: YahooFinance } = await import('yahoo-finance2');
        const yahooFinance = new YahooFinance();
        
        // Map symbols to Yahoo-friendly format
        const yahooSymbolMap = new Map<string, string>();
        const querySymbols: string[] = [];
        
        for (const sym of symbols) {
          const upperSym = sym.toUpperCase().trim();
          if (upperSym.startsWith('BSE:')) {
            const code = upperSym.split(':')[1];
            if (code) {
              const yahooSym = `${code}.BO`;
              yahooSymbolMap.set(yahooSym, sym);
              querySymbols.push(yahooSym);
            }
          } else {
            const yahooSym = `${upperSym}.NS`;
            yahooSymbolMap.set(yahooSym, sym);
            querySymbols.push(yahooSym);
          }
        }

        // Fetch in batches of 50
        const yahooQuotes: any[] = [];
        const batchSize = 50;
        for (let i = 0; i < querySymbols.length; i += batchSize) {
          const batch = querySymbols.slice(i, i + batchSize);
          try {
            const results = await yahooFinance.quote(batch);
            const list = Array.isArray(results) ? results : [results];
            yahooQuotes.push(...list.filter(Boolean));
          } catch (batchErr) {
            // Keep going if a batch fails
          }
        }

        if (yahooQuotes.length > 0) {
          for (const yq of yahooQuotes) {
            const originalSym = yahooSymbolMap.get(yq.symbol) || yq.symbol.replace('.NS', '').replace('.BO', '');
            const info = companyLookup.get(originalSym);
            quotes.push({
              symbol: originalSym,
              name: yq.longName || info?.name || originalSym,
              sector: info?.sector || null,
              price: yq.regularMarketPrice || null,
              change: yq.regularMarketChange || 0,
              changePercent: yq.regularMarketChangePercent || 0,
              volume: yq.regularMarketVolume || 0,
              turnover: (yq.regularMarketPrice || 0) * (yq.regularMarketVolume || 0),
              high: yq.regularMarketDayHigh || yq.regularMarketPrice || null,
              low: yq.regularMarketDayLow || yq.regularMarketPrice || null,
              open: yq.regularMarketOpen || yq.regularMarketPrice || null,
              close: yq.regularMarketPreviousClose || yq.regularMarketPrice || null,
              exchange: yq.symbol.endsWith('.NS') ? 'NSE' : yq.symbol.endsWith('.BO') ? 'BSE' : 'NSE',
              timestamp: new Date().toISOString(),
              source: 'yahoo-direct-fallback',
              // Financial Data Enrichment
              marketCap: yq.marketCap || info?.marketCap || null,
              peRatio: yq.trailingPE || null,
              eps: yq.epsTrailingTwelveMonths || null,
              priceToBook: yq.priceToBook || null,
              fiftyTwoWeekHigh: yq.fiftyTwoWeekHigh || null,
              fiftyTwoWeekLow: yq.fiftyTwoWeekLow || null,
              dividendYield: yq.dividendYield || null,
            });
          }
          if (quotes.length > 0) {
            source = 'yahoo-direct-fallback';
          }
        }
      } catch (yahooErr) {
        // Yahoo Finance failed
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
          // Financial defaults
          marketCap: info?.marketCap || null,
          peRatio: null,
          eps: null,
          priceToBook: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          dividendYield: null,
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
