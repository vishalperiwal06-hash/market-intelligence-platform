import { NextRequest, NextResponse } from 'next/server';
import { symbolMaster } from '@/server/market-engine/orchestration/symbol-master';
import { nseDataService } from '@/server/nse/nselib-service';
import { db } from '@/lib/db';
import { companies } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const type = (searchParams.get('type') || 'all') as 'all' | 'fno' | 'sme' | 'etf';

    await symbolMaster.refreshUniverse(refresh);

    let records: any[] = [];
    let source = 'unknown';

    // Try NSE data service first
    try {
      const nseRecords = await nseDataService.universe(refresh);
      if (nseRecords && nseRecords.length > 0) {
        records = nseRecords;
        source = 'nselib';
      }
    } catch {
      // NSE data service unavailable
    }

    // Fallback: load from PostgreSQL companies table
    if (records.length === 0) {
      const dbCompanies = await db.select({
        symbol: companies.symbol,
        name: companies.name,
        sector: companies.sector,
        industry: companies.industry,
        exchange: companies.exchange,
      })
        .from(companies)
        .where(eq(companies.isActive, true));

      records = dbCompanies.map(c => ({
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
        industry: c.industry,
        instrument_type: 'EQUITY',
        exchange: c.exchange || 'NSE',
        is_fno: false,
        is_sme: false,
        is_etf: false,
        source: 'database',
      }));
      source = 'database';
    }

    const filtered = records.filter(record => {
      if (type === 'fno') return record.is_fno;
      if (type === 'sme') return record.is_sme;
      if (type === 'etf') return record.is_etf;
      return true;
    });

    return NextResponse.json({
      ok: true,
      data: filtered,
      meta: {
        count: filtered.length,
        type,
        source,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UNIVERSE_FETCH_FAILED',
          message: 'Failed to load symbol universe',
          details: error.message,
        },
      },
      { status: 500 },
    );
  }
}
