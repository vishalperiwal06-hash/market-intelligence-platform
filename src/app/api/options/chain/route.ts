import { NextRequest, NextResponse } from 'next/server';

const NSE_DATA_SERVICE_URL = process.env.NSE_DATA_SERVICE_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase();
    const expiry = searchParams.get('expiry');

    if (!symbol) {
      return NextResponse.json({ ok: false, error: { message: 'symbol is required' } }, { status: 400 });
    }

    const params = new URLSearchParams({ symbol });
    if (expiry) params.set('expiry', expiry);

    const response = await fetch(`${NSE_DATA_SERVICE_URL}/api/v1/options/chain?${params}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 15 },
    });

    if (!response.ok) {
      throw new Error(`NSE data service returned ${response.status}`);
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'OPTION_CHAIN_FAILED',
          message: 'Failed to load option chain',
          details: error.message,
        },
      },
      { status: 500 },
    );
  }
}
