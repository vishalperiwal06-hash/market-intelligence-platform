import { NextResponse } from 'next/server';
import { kgQueryEngine } from '@/server/knowledge-graph/kg-query-engine';

export async function GET() {
  try {
    const diagnostics = await kgQueryEngine.getGraphDiagnostics();
    return NextResponse.json({ diagnostics });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
