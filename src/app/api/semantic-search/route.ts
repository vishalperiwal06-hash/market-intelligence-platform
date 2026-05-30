import { NextRequest, NextResponse } from 'next/server';
import { semanticRetrievalEngine } from '@/server/semantic-engine/retrieval-engine';
import { contextualCopilot } from '@/server/semantic-engine/contextual-copilot';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const symbol = searchParams.get('symbol');
    const mode = searchParams.get('mode') || 'search'; // 'search' | 'copilot'
    
    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    if (mode === 'copilot') {
      const copilotPayload = await contextualCopilot.retrieveContext(query, symbol || undefined);
      return NextResponse.json({ data: copilotPayload });
    }

    // Default: Raw Semantic Search
    const results = await semanticRetrievalEngine.search(
      query,
      10,
      0.3, // Lower threshold for testing
      symbol ? { symbol } : undefined
    );

    return NextResponse.json({ data: results });

  } catch (error: any) {
    console.error('Semantic Search API Error:', error);
    return NextResponse.json(
      { error: 'Failed to execute semantic search', details: error.message }, 
      { status: 500 }
    );
  }
}
