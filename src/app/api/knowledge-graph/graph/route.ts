import { NextResponse } from 'next/server';
import { kgQueryEngine } from '@/server/knowledge-graph/kg-query-engine';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    const graph = await kgQueryEngine.getCompanyRelationshipGraph(symbol);

    if (!graph) {
      return NextResponse.json({ graph: null, message: 'No relationship graph found for this company yet.' });
    }

    return NextResponse.json({ graph });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
