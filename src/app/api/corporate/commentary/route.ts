import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { managementCommentary } from '@/lib/db/schema';
import { desc, eq, and } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const topic = searchParams.get('topic');
    const limit = parseInt(searchParams.get('limit') || '20');

    const conditions = [];
    if (symbol) conditions.push(eq(managementCommentary.symbol, symbol));
    if (topic) conditions.push(eq(managementCommentary.topic, topic));

    let results = await db.select()
      .from(managementCommentary)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(managementCommentary.extractedAt))
      .limit(limit);

    // Zero-fabrication policy: return empty commentary when none is found in DB
    return NextResponse.json({ commentary: results });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
