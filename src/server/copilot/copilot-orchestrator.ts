import { intentRouter } from './intent-router';
import { evidenceEngine, CopilotEvidencePackage } from './evidence-engine';
import { hallucinationGuard } from './hallucination-guard';
import { aiOrchestrator } from '../ai-orchestrator/orchestrator';
import { logger } from '../../lib/logger';
import { db } from '../../lib/db';
import { copilotMessages, copilotContextSnapshots } from '../../lib/db/schema';
import { redis } from '../../lib/redis';
import crypto from 'crypto';

export interface CopilotResponse {
  answer: string;
  confidenceScore: number;
  evidenceUsed: CopilotEvidencePackage;
  citations: any[];
}

export class CopilotOrchestrator {
  
  /**
   * Main entry point for a user query.
   * Multi-Step Reasoning Pipeline:
   * 1. Intent Classification
   * 2. Evidence Retrieval
   * 3. Market Context Injection
   * 4. AI Draft Generation
   * 5. Validation Pass
   * 6. Formatting & Storage
   */
  async processQuery(sessionId: string, query: string): Promise<CopilotResponse> {
    logger.info('CopilotOrchestrator', `Processing query for session ${sessionId}`);

    // D. AI COST + QUALITY OPTIMIZATION: Simple query caching
    const queryHash = crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
    const cacheKey = `copilot:cache:${queryHash}`;
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.info('CopilotOrchestrator', 'Serving response from cache');
        const parsed = JSON.parse(cached);
        
        // Still persist the message for conversation history
        await db.insert(copilotMessages).values({
          sessionId, role: 'assistant', content: parsed.answer,
          intent: 'cached', confidenceScore: parsed.confidenceScore,
          citations: parsed.citations
        });
        return parsed;
      }
    } catch (e) {
      // Ignore cache errors
    }

    // Step 1: Intent Classification
    const { intent, symbols } = await intentRouter.classifyIntent(query);

    // Step 2 & 3: Package Evidence & Market Context
    const evidence = await evidenceEngine.packageEvidence(query, intent, symbols);

    // Step 4: AI Draft Generation (Deep Reasoning)
    const draft = await this.generateDraft(query, evidence, intent);

    // Step 5: Hallucination Guard Validation
    const validation = await hallucinationGuard.validateDraft(draft, evidence);

    let finalAnswer = draft;
    if (!validation.isSupported) {
      logger.warn('CopilotOrchestrator', `Draft rejected by guard: ${validation.reason}`);
      finalAnswer = `Based on the verified platform data, I do not have enough evidence to answer this. The internal validation system flagged my initial draft for the following reason: ${validation.reason}. I must adhere to strict zero-fabrication rules.`;
    }

    // Step 6: Store in DB for Conversation Memory & Traceability
    // We create a message, then attach a snapshot of the context.
    const messageResult = await db.insert(copilotMessages).values({
      sessionId,
      role: 'assistant',
      content: finalAnswer,
      intent,
      confidenceScore: validation.confidenceScore,
      citations: evidence.semanticEvidence.map(e => ({ source: e.source, date: e.date, symbol: e.symbol }))
    }).returning({ id: copilotMessages.id });

    if (messageResult.length > 0) {
      await db.insert(copilotContextSnapshots).values({
        messageId: messageResult[0].id,
        marketRegime: evidence.marketContext.regime,
        injectedEvidence: evidence.semanticEvidence
      });
    }

    const responseObj: CopilotResponse = {
      answer: finalAnswer,
      confidenceScore: validation.confidenceScore,
      evidenceUsed: evidence,
      citations: evidence.semanticEvidence
    };

    try {
      // Cache for 6 hours
      await redis.set(cacheKey, JSON.stringify(responseObj), 'EX', 21600);
    } catch (e) {
      // Ignore cache write errors
    }

    return responseObj;
  }

  private async generateDraft(query: string, evidence: CopilotEvidencePackage, intent: string): Promise<string> {
    const systemPrompt = `You are an institutional financial Copilot operating under a strict ZERO-FABRICATION policy.
You are given a highly structured Evidence Package containing real market context, scanner signals, and semantic document excerpts.

YOUR TASK:
Answer the user's query using ONLY the provided evidence.

MARKET REALITY:
- Active Regime: ${evidence.marketContext.regime}
- Market Breadth: ${evidence.marketContext.breadth}

RULES:
1. NEVER invent numbers, revenue guidance, or macro states.
2. If the evidence does not answer the question, explicitly state: "I do not have the verified documents to answer this."
3. When using evidence, cite it inline using the format [SYMBOL, Date].
4. Contextualize your answer with the provided MARKET REALITY. (e.g. "Given the current RISK_OFF regime...")`;

    const prompt = `USER QUERY:
${query}

SEMANTIC EVIDENCE CHUNKS:
${JSON.stringify(evidence.semanticEvidence, null, 2)}`;

    const response = await aiOrchestrator.generate('COPILOT', {
      prompt,
      systemPrompt,
      temperature: 0.1, // Low temperature for deterministic, factual outputs
      maxTokens: 1500
    });

    return response.text;
  }
}

export const copilotOrchestrator = new CopilotOrchestrator();
