import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { companies } from '@/lib/db/schema';
import { nseDataService } from '@/server/nse/nselib-service';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '3000', 10), 4000);

    // Fetch all active companies from the PostgreSQL database
    const dbCompanies = await db.select({ symbol: companies.symbol })
      .from(companies)
      .where(eq(companies.isActive, true));

    let symbols = dbCompanies
      .map(c => c.symbol?.toUpperCase().trim())
      .filter(sym => sym && sym.length <= 15 && /^[A-Z0-9&-]+$/.test(sym))
      .slice(0, limit);

    if (symbols.length === 0) {
      // Fallback to high-conviction index heavyweights if DB is not seeded yet
      symbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'ITC', 'AXISBANK', 'LT', 'BHARTIARTL'];
    }

    const quotes = await nseDataService.quotes(symbols);
    
    return NextResponse.json({
      ok: true,
      data: quotes,
      meta: {
        count: quotes.length,
        source: 'nse-data-service',
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
