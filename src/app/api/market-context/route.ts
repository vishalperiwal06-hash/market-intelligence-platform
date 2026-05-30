import { NextResponse } from 'next/server';
import { marketContextGenerator } from '@/server/market-context-engine/context-generator';

export async function GET() {
  try {
    const context = await marketContextGenerator.generateUnifiedContext();
    
    if (!context) {
      return NextResponse.json({ error: 'Failed to generate market context' }, { status: 500 });
    }

    return NextResponse.json({ context });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
