import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { corporateFilings, filingDocuments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { aiOrchestrator } from '@/server/ai-orchestrator/orchestrator';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Filing ID is required' }, { status: 400 });
    }

    // 1. Fetch the filing from PostgreSQL
    const filingRows = await db
      .select()
      .from(corporateFilings)
      .where(eq(corporateFilings.id, id))
      .limit(1);

    if (filingRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Filing not found' }, { status: 404 });
    }

    const filing = filingRows[0];

    // 2. Fetch the associated parsed PDF document text from filingDocuments
    const docRows = await db
      .select()
      .from(filingDocuments)
      .where(eq(filingDocuments.filingId, id))
      .limit(1);

    const doc = docRows[0] || null;
    const extractedText = doc?.extractedText || null;

    // 3. Prepare AI query and context
    const systemPrompt = `You are a certified institutional financial analyst operating under a strict zero-fabrication protocol.
Your task is to synthesize a professional, concise, and factually bulletproof summary of the corporate filing.
Focus on:
- Financial outcomes/numbers (revenues, profits, margins, capex, guidance)
- Board announcements (dividend payouts, corporate restructuring, merger/acquisition deals)
- Commercial contracts (order wins, customer acquisitions, values, timelines)
- Executive transitions or regulatory compliance events.

Rules:
- Ground all facts strictly in the text provided.
- Do NOT extrapolate, speculate, or invent any numbers or implications.
- If there are no concrete financial details or order values, summarize the subject factually.
- Format beautifully using Markdown with clear bold headers and bullets.`;

    const prompt = `Synthesize a professional and precise financial summary for this corporate filing:
Company: ${filing.companyName} (${filing.symbol})
Exchange: ${filing.exchange}
Category: ${filing.category}
Subject: ${filing.subject}
Details: ${filing.details || 'No additional metadata available.'}
Broadcast Date: ${new Date(filing.broadcastDate).toUTCString()}

${
  extractedText
    ? `EXTRACTED DOCUMENT PDF TEXT (first 3500 characters):
---
${extractedText.slice(0, 3500)}
---`
    : `Note: The parsed PDF document text is not immediately available. Please synthesize the summary using the structured metadata above.`
}`;

    // 4. Generate summary using the AI Orchestrator with reasoning capability
    logger.info('FilingSummarizeAPI', `Generating summary for filing ${id} (${filing.symbol})`);
    
    const aiResponse = await aiOrchestrator.generate('REASONING', {
      prompt,
      systemPrompt,
      temperature: 0.1, // Deterministic factual synthesis
      maxTokens: 1000,
    });

    const summaryText = aiResponse.text;

    // 5. Cache the summary back to the filing record in postgres for future fast loading
    await db
      .update(corporateFilings)
      .set({
        details: filing.details || summaryText, // Fallback / enhancement if details is empty
      })
      .where(eq(corporateFilings.id, id));

    return NextResponse.json({
      ok: true,
      summary: summaryText,
      source: aiResponse.model,
    });
  } catch (error: any) {
    logger.error('FilingSummarizeAPI', 'Failed to generate filing summary', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error generating AI summary' },
      { status: 500 }
    );
  }
}
