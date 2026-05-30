import { NextResponse } from 'next/server';
import { nseDataService } from '@/server/nse/nselib-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '1M';
    const data = await nseDataService.vixHistory(period);
    return NextResponse.json({ ok: true, data, meta: { count: data.length } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
