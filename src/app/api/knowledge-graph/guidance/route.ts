import { NextResponse } from 'next/server';
import { kgQueryEngine } from '@/server/knowledge-graph/kg-query-engine';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const action = searchParams.get('action');
    const guidanceType = searchParams.get('type');

    if (!symbol && action !== 'repeated') {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    // Repeated guidance query (cross-company)
    if (action === 'repeated' && guidanceType) {
      const minRep = parseInt(searchParams.get('minRepetitions') || '2');
      const companies = await kgQueryEngine.getRepeatedGuidanceCompanies(guidanceType, minRep);
      return NextResponse.json({ companies });
    }

    // Company guidance history
    const history = await kgQueryEngine.getGuidanceHistory(symbol!, guidanceType || undefined);
    return NextResponse.json({ guidance: history });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
