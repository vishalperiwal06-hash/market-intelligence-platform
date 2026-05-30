import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db';
import { users, userSessions, auditLogs } from './db/schema';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: Date;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload: Record<string, unknown>, expiresInSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedBody = base64Url(JSON.stringify(body));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedBody}.${signature}`;
}

function verifyJwt<T extends Record<string, unknown>>(token: string): T | null {
  const [encodedHeader, encodedBody, signature] = token.split('.');
  if (!encodedHeader || !encodedBody || !signature) return null;

  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const payload = JSON.parse(Buffer.from(encodedBody, 'base64url').toString('utf8')) as T & { exp?: number };
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class AuthEngine {
  async register(email: string, password: string, displayName: string): Promise<AuthUser> {
    if (!email || !password || password.length < 8) {
      throw new Error('Invalid registration: email required, password must be at least 8 characters');
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
    if (existing.length > 0) throw new Error('User already exists');

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(users).values({
      email: email.toLowerCase().trim(),
      passwordHash,
      displayName: displayName.trim(),
      role: 'user',
    }).returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
    });

    return user;
  }

  async login(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const result = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (result.length === 0) throw new Error('Invalid credentials');

    const user = result[0];
    if (!user.isActive) throw new Error('Account disabled');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    const authUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
    const tokens = await this.createTokenPair(authUser, ipAddress, userAgent);

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await db.insert(auditLogs).values({
      userId: user.id,
      action: 'LOGIN',
      ipAddress,
      details: { userAgent },
    });

    return { user: authUser, tokens };
  }

  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const tokenHash = hashToken(refreshToken);
    const result = await db.select({
      sessionId: userSessions.id,
      expiresAt: userSessions.expiresAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      isActive: users.isActive,
    })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(eq(userSessions.token, tokenHash));

    if (result.length === 0) throw new Error('Invalid refresh token');
    const session = result[0];
    if (new Date() > session.expiresAt || !session.isActive) throw new Error('Refresh token expired');

    await db.delete(userSessions).where(eq(userSessions.id, session.sessionId));

    const user = {
      id: session.userId,
      email: session.email,
      displayName: session.displayName,
      role: session.role,
    };
    const tokens = await this.createTokenPair(user, ipAddress, userAgent);
    return { user, tokens };
  }

  async validateAccessToken(token: string): Promise<AuthUser | null> {
    if (!token) return null;
    const payload = verifyJwt<{ sub: string; email: string; displayName: string; role: string }>(token);
    if (!payload) return null;

    return {
      id: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
      role: payload.role,
    };
  }

  async validateSession(token: string): Promise<AuthUser | null> {
    const jwtUser = await this.validateAccessToken(token);
    if (jwtUser) return jwtUser;

    const result = await db.select({
      userId: userSessions.userId,
      expiresAt: userSessions.expiresAt,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      isActive: users.isActive,
    })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(eq(userSessions.token, hashToken(token)));

    if (result.length === 0) return null;
    const session = result[0];
    if (new Date() > session.expiresAt || !session.isActive) return null;

    return {
      id: session.userId,
      email: session.email,
      displayName: session.displayName,
      role: session.role,
    };
  }

  async logout(token: string): Promise<void> {
    await db.delete(userSessions).where(eq(userSessions.token, hashToken(token)));
  }

  private async createTokenPair(user: AuthUser, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
    const accessToken = signJwt({
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    }, ACCESS_TTL_SECONDS);

    const refreshToken = crypto.randomBytes(64).toString('base64url');
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await db.insert(userSessions).values({
      userId: user.id,
      token: hashToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: ACCESS_TTL_SECONDS,
      refreshTokenExpiresAt,
    };
  }
}

export const authEngine = new AuthEngine();
