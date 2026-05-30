import { NextRequest, NextResponse } from 'next/server';
import { copilotOrchestrator } from '@/server/copilot/copilot-orchestrator';
import { db } from '@/lib/db';
import { copilotSessions } from '@/lib/db/schema';
import { authEngine } from '@/lib/auth';
import { aiSecurityGuard } from '@/server/ai-security/security-guard';
import { rateLimiter } from '@/server/security/rate-limiter';
import { validateBody, copilotQuerySchema } from '@/server/security/validation';

export async function POST(request: NextRequest) {
  // 1. Auth Guard
  const token = request.cookies.get('session_token')?.value;
  const user = token ? await authEngine.validateSession(token) : null;
  const userId = user?.id || 'anon';

  // 2. Rate Limit
  const limit = await rateLimiter.check(userId, 'api:copilot');
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.', retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();

    // 3. Schema Validation
    const validation = validateBody(copilotQuerySchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { query, sessionId } = validation.data!;

    // 4. AI Security Scan — block prompt injection / jailbreaks
    const securityScan = aiSecurityGuard.scanInput(query);
    if (!securityScan.isSafe) {
      return NextResponse.json(
        { error: 'Query rejected by security policy', threat: securityScan.threat },
        { status: 403 }
      );
    }

    // 5. Resolve or create session
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const newSession = await db.insert(copilotSessions).values({
        title: aiSecurityGuard.sanitize(query.substring(0, 50)) + '...',
      }).returning({ id: copilotSessions.id });
      activeSessionId = newSession[0].id;
    }

    // 6. Process
    const response = await copilotOrchestrator.processQuery(activeSessionId, query);

    // 7. Scan AI output for credential leaks
    const outputScan = aiSecurityGuard.scanOutput(response.answer);
    const safeAnswer = outputScan.isSafe
      ? response.answer
      : '[REDACTED — AI output contained unsafe content and was blocked by the security layer]';

    return NextResponse.json({
      success: true,
      data: {
        sessionId: activeSessionId,
        answer: safeAnswer,
        confidenceScore: response.confidenceScore,
        evidenceUsed: response.evidenceUsed,
        citations: response.citations
      }
    });

  } catch (error: any) {
    console.error('Copilot API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process copilot query', details: error.message },
      { status: 500 }
    );
  }
}
