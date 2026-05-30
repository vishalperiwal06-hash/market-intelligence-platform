import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    const latest = await redis.get('ai:narrative:latest');
    if (!latest) {
      return NextResponse.json({ narrative: null });
    }
    return NextResponse.json({ narrative: JSON.parse(latest) });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
