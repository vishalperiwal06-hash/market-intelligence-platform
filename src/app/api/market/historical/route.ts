import { NextResponse } from 'next/server';
import { nseDataService } from '@/server/nse/nselib-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || 'NIFTY').toUpperCase();
    const period = searchParams.get('period') || '1M';
    const data = await nseDataService.historical(symbol, period);
    return NextResponse.json({ ok: true, data, meta: { count: data.length, symbol, period } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
