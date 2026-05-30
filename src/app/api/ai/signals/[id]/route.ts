import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { db } from '@/lib/db';
import { aiSignalAnalysis } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Check cache first
    const cached = await redis.get(`ai:signal:${id}`);
    if (cached) {
      return NextResponse.json({ analysis: JSON.parse(cached) });
    }

    // Fallback to DB
    const [analysis] = await db.select().from(aiSignalAnalysis).where(eq(aiSignalAnalysis.signalId, id)).limit(1);
    
    if (!analysis) {
      return NextResponse.json({ analysis: null }, { status: 404 });
    }

    // Recache it
    await redis.setex(`ai:signal:${id}`, 86400, JSON.stringify(analysis));

    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
