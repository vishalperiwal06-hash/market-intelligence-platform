import { NextRequest, NextResponse } from 'next/server';
import { authEngine } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value || request.cookies.get('session_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  if (accessToken) {
    const user = await authEngine.validateAccessToken(accessToken);
    if (user) {
      return NextResponse.json({ authenticated: true, user });
    }
  }

  if (refreshToken) {
    try {
      const refreshed = await authEngine.refresh(
        refreshToken,
        request.headers.get('x-forwarded-for') || 'unknown',
        request.headers.get('user-agent') || undefined,
      );
      const response = NextResponse.json({ authenticated: true, user: refreshed.user });
      response.cookies.set('access_token', refreshed.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: refreshed.tokens.accessTokenExpiresIn,
        path: '/',
      });
      response.cookies.set('refresh_token', refreshed.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });
      response.cookies.set('session_token', refreshed.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: refreshed.tokens.accessTokenExpiresIn,
        path: '/',
      });
      return response;
    } catch {
      // fall through and clear cookies
    }
  }

  const response = NextResponse.json({ authenticated: false, user: null });
  response.cookies.delete('access_token');
  response.cookies.delete('refresh_token');
  response.cookies.delete('session_token');
  return response;
}

export async function DELETE(request: NextRequest) {
  const refreshToken = request.cookies.get('refresh_token')?.value || request.cookies.get('session_token')?.value;
  if (refreshToken) {
    await authEngine.logout(refreshToken);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('access_token');
  response.cookies.delete('refresh_token');
  response.cookies.delete('session_token');
  return response;
}
