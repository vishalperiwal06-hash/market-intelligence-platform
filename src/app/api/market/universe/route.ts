import { NextRequest, NextResponse } from 'next/server';
import { symbolMaster } from '@/server/market-engine/orchestration/symbol-master';
import { nseDataService } from '@/server/nse/nselib-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const type = (searchParams.get('type') || 'all') as 'all' | 'fno' | 'sme' | 'etf';

    await symbolMaster.refreshUniverse(refresh);
    const records = await nseDataService.universe(refresh);
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
        source: 'nselib',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UNIVERSE_FETCH_FAILED',
          message: 'Failed to load NSE universe',
          details: error.message,
        },
      },
      { status: 500 },
    );
  }
}
