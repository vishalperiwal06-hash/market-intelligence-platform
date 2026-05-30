import { NextResponse } from 'next/server';
import { kgQueryEngine } from '@/server/knowledge-graph/kg-query-engine';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '30');

    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    const timeline = await kgQueryEngine.getCompanyTimeline(symbol, limit);
    return NextResponse.json({ timeline });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
