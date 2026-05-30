import { NextResponse } from 'next/server';

const NSE_DATA_SERVICE_URL = process.env.NSE_DATA_SERVICE_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const response = await fetch(`${NSE_DATA_SERVICE_URL}/api/v1/derivatives/ban-list`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });

    if (!response.ok) throw new Error(`NSE data service returned ${response.status}`);
    return NextResponse.json(await response.json());
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'BAN_LIST_FAILED', message: error.message } },
      { status: 500 },
    );
  }
}
