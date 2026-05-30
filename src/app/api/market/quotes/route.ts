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
      // Zero-fabrication policy: return empty rather than hardcoded index heavyweights
      return NextResponse.json({
        ok: true,
        data: [],
        meta: { count: 0, source: 'nse-data-service', note: 'No active companies seeded in database yet' },
      });
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
