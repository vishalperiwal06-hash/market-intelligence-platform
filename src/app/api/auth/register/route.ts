import { NextRequest, NextResponse } from 'next/server';
import { authEngine } from '@/lib/auth';
import { validateBody, registerSchema } from '@/server/security/validation';
import { rateLimiter } from '@/server/security/rate-limiter';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  // Rate limit
  const limit = await rateLimiter.check(ip, 'api:auth');
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const validation = validateBody(registerSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { email, password, displayName } = validation.data!;
    const user = await authEngine.register(email, password, displayName);

    return NextResponse.json({ success: true, data: { user } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
