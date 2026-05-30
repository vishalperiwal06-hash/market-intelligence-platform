import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { corporateFilings } from '@/lib/db/schema';
import { desc, isNotNull } from 'drizzle-orm';
import { nseDataService } from '@/server/nse/nselib-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Fetch recent filings that have a valid priceAtAnnouncement
    const recentFilings = await db
      .select()
      .from(corporateFilings)
      .where(isNotNull(corporateFilings.priceAtAnnouncement))
      .orderBy(desc(corporateFilings.broadcastDate))
      .limit(300);

    if (recentFilings.length === 0) {
      return NextResponse.json({
        ok: true,
        strongest: [],
        weaker: [],
      });
    }

    // 2. Filter duplicates - keep only the latest filing per symbol
    const latestFilingPerSymbol = new Map<string, typeof corporateFilings.$inferSelect>();
    for (const filing of recentFilings) {
      if (!latestFilingPerSymbol.has(filing.symbol)) {
        latestFilingPerSymbol.set(filing.symbol, filing);
      }
    }
    const uniqueFilings = Array.from(latestFilingPerSymbol.values());

    // 3. Fetch current live quotes for these symbols in parallel
    const symbols = uniqueFilings.map((f) => f.symbol);
    let quotes: any[] = [];
    try {
      quotes = await nseDataService.quotes(symbols);
    } catch (e) {
      logger.error('FilingsImpactAPI', 'Failed to fetch live quotes for filings impact calculation', e);
    }

    const quoteMap = new Map<string, any>();
    for (const q of quotes) {
      quoteMap.set(q.symbol, q);
    }

    // 4. Calculate dynamic real-time price impact percent
    const filingsWithImpact = uniqueFilings
      .map((filing) => {
        const quote = quoteMap.get(filing.symbol);
        const currentPrice = quote ? quote.price : null;
        const priceAtAnnouncement = filing.priceAtAnnouncement;

        let impactPercent = 0;
        if (currentPrice && priceAtAnnouncement && priceAtAnnouncement > 0) {
          impactPercent = ((currentPrice - priceAtAnnouncement) / priceAtAnnouncement) * 100;
        }

        return {
          ...filing,
          currentPrice,
          changePercent: quote ? quote.changePercent : 0,
          impactPercent,
        };
      })
      .filter((f) => f.currentPrice !== null);

    // 5. Separate into strongest and weaker lists (up to 50 each)
    const strongest = [...filingsWithImpact]
      .filter((f) => f.impactPercent > 0)
      .sort((a, b) => b.impactPercent - a.impactPercent)
      .slice(0, 50);

    const weaker = [...filingsWithImpact]
      .filter((f) => f.impactPercent < 0)
      .sort((a, b) => a.impactPercent - b.impactPercent)
      .slice(0, 50);

    return NextResponse.json({
      ok: true,
      strongest,
      weaker,
    });
  } catch (error: any) {
    logger.error('FilingsImpactAPI', 'Error calculating filings price impact', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error calculating filings price impact' },
      { status: 500 },
    );
  }
}
