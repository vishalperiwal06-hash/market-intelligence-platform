import { NextResponse } from 'next/server';
import { nseDataService } from '@/server/nse/nselib-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await nseDataService.deals();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'DEALS_FETCH_FAILED',
          message: 'Failed to retrieve Bulk/Block deal data',
          details: error.message,
        },
      },
      { status: 500 }
    );
  }
}
