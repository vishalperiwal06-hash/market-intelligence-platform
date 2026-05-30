import { NextRequest, NextResponse } from 'next/server';
import { authEngine } from '@/lib/auth';
import { validateBody, loginSchema } from '@/server/security/validation';
import { rateLimiter } from '@/server/security/rate-limiter';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  const limit = await rateLimiter.check(ip, 'api:auth');
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const validation = validateBody(loginSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { email, password } = validation.data!;
    const result = await authEngine.login(email, password, ip, request.headers.get('user-agent') || undefined);

    const response = NextResponse.json({
      success: true,
      data: {
        user: result.user,
        accessTokenExpiresIn: result.tokens.accessTokenExpiresIn,
      },
    });

    response.cookies.set('access_token', result.tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: result.tokens.accessTokenExpiresIn,
      path: '/',
    });

    response.cookies.set('refresh_token', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    response.cookies.set('session_token', result.tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: result.tokens.accessTokenExpiresIn,
      path: '/',
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
