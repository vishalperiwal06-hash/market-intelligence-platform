import { NextResponse } from 'next/server';
import { kgQueryEngine } from '@/server/knowledge-graph/kg-query-engine';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const theme = searchParams.get('theme');
    const symbol = searchParams.get('symbol');
    const action = searchParams.get('action');

    // Theme heatmap
    if (action === 'heatmap') {
      const heatmap = await kgQueryEngine.getThemeHeatmap();
      return NextResponse.json({ heatmap });
    }

    // All themes for a company
    if (symbol && !theme) {
      const themes = await kgQueryEngine.getCompanyThemes(symbol);
      return NextResponse.json({ themes });
    }

    // All companies for a theme
    if (theme && !symbol) {
      const minConfidence = parseFloat(searchParams.get('minConfidence') || '0.3');
      const companies = await kgQueryEngine.getCompaniesByTheme(theme, minConfidence);
      return NextResponse.json({ companies });
    }

    return NextResponse.json({ error: 'Provide theme or symbol query parameter' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
