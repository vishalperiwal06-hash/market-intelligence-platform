import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractedFinancials } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const limit = parseInt(searchParams.get('limit') || '20');

  try {
    let results: any[] = [];
    
    try {
      results = await db.select()
        .from(extractedFinancials)
        .where(symbol ? eq(extractedFinancials.symbol, symbol) : undefined)
        .orderBy(desc(extractedFinancials.extractedAt))
        .limit(limit);
    } catch (err: any) {
      console.warn('Financials DB query failed. Falling back to high-fidelity mock financials.', err.message);
    }

    // Zero-fabrication policy: return empty financials when none are found in DB
    return NextResponse.json({ financials: results });
  } catch (error: any) {
    return NextResponse.json({ financials: [] });
  }
}
