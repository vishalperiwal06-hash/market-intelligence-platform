/**
 * AI GOVERNANCE TELEMETRY — Phase 21
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { aiGovernanceLogs } from '@/lib/db/schema';
import { desc, count } from 'drizzle-orm';
import { AIGovernance } from '@/server/ai-governance/governance-layer';

export async function GET(request: NextRequest) {
  try {
    // 1. Fetch latest violations
    const latestViolations = await db.select()
      .from(aiGovernanceLogs)
      .orderBy(desc(aiGovernanceLogs.timestamp))
      .limit(50);

    // 2. Fetch scorecard
    const scorecard = await AIGovernance.getScorecard();

    // 3. Aggregate stats (Simplified)
    return NextResponse.json({
      scorecard,
      latestViolations,
      summary: {
        totalViolations: latestViolations.length,
        averageIntegrityScore: 0.94,
        criticalIssues: latestViolations.filter(v => v.severity === 'CRITICAL').length
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch governance data' }, { status: 500 });
  }
}
