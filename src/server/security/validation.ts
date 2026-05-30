/**
 * Request Validation Middleware — Zod schema enforcement
 * Phase 16 — Production Hardening
 */
import { z } from 'zod';

export const copilotQuerySchema = z.object({
  query: z.string().min(1).max(5000),
  sessionId: z.string().uuid().optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100),
});

export const portfolioHoldingSchema = z.object({
  symbol: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/),
  quantity: z.number().int().positive(),
  averagePrice: z.number().positive(),
});

export const watchlistSchema = z.object({
  name: z.string().min(1).max(100),
  symbols: z.array(z.string().min(1).max(20)),
});

/**
 * Validates incoming request body against a Zod schema.
 * Returns { success, data, error }.
 */
export function validateBody<T>(schema: z.ZodType<T>, body: unknown): { success: boolean; data?: T; error?: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') };
  }
  return { success: true, data: result.data };
}
