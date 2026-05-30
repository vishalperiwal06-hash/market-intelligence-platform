import { NextResponse } from 'next/server';
import { nseDataService } from '@/server/nse/nselib-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const indices = await nseDataService.indices();
    
    // Extract key indices that we need: NIFTY 50, NIFTY BANK, SENSEX
    const targets = ['NIFTY 55', 'NIFTY 50', 'NIFTY BANK', 'SENSEX', 'Nifty 50', 'Nifty Bank'];
    const filtered = indices.filter(idx => 
      targets.some(t => idx.symbol.toUpperCase().includes(t.toUpperCase()))
    );

    return NextResponse.json({
      ok: true,
      data: filtered.length > 0 ? filtered : indices,
      meta: {
        count: filtered.length,
        source: 'nse-data-service',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'INDICES_FETCH_FAILED',
          message: 'Failed to retrieve index quotes',
          details: error.message,
        },
      },
      { status: 500 }
    );
  }
}
