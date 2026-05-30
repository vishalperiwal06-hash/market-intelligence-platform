import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    const diagnostics = await redis.hgetall('parsing:diagnostics');
    return NextResponse.json({ diagnostics });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
