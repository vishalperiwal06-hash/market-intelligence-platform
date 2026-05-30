import { NextResponse } from 'next/server';
import { nseDataService } from '@/server/nse/nselib-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await nseDataService.fiiDii();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'FII_DII_FETCH_FAILED',
          message: 'Failed to retrieve FII/DII flow activity data',
          details: error.message,
        },
      },
      { status: 500 }
    );
  }
}
