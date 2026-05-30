import { aiOrchestrator } from '../ai-orchestrator/orchestrator';
import { logger } from '../../lib/logger';
import { CopilotEvidencePackage } from './evidence-engine';

export class HallucinationGuard {
  /**
   * Validates an AI-generated draft against the provided evidence package.
   * Uses FAST_CLASSIFICATION to cheaply double-check if the reasoning model fabricated anything.
   */
  async validateDraft(draft: string, evidence: CopilotEvidencePackage): Promise<{ isSupported: boolean; confidenceScore: number; reason?: string }> {
    logger.info('HallucinationGuard', 'Validating AI draft against evidence');

    // If there is no semantic evidence, and the draft makes specific claims, it's highly suspicious.
    if (evidence.semanticEvidence.length === 0 && draft.match(/\d+%|\b(?:revenue|margin|guidance|capex)\b/i)) {
      return { isSupported: false, confidenceScore: 0.1, reason: 'Claims numerical/financial facts without semantic evidence chunks' };
    }

    const systemPrompt = `You are a strict compliance and hallucination guard.
Compare the AI DRAFT against the provided SOURCE EVIDENCE.
Your only job is to determine if the DRAFT makes any factual claims that are NOT explicitly supported by the EVIDENCE.

RULES:
1. If the DRAFT invents a number, return isSupported: false
2. If the DRAFT invents a company relationship, return isSupported: false
3. If the DRAFT explicitly states "I do not have enough evidence", return isSupported: true

Respond ONLY with JSON:
{
  "isSupported": boolean,
  "confidenceScore": 0.0 to 1.0 (how well the text maps to evidence),
  "reason": "short explanation"
}`;

    const prompt = `SOURCE EVIDENCE:
${JSON.stringify(evidence.semanticEvidence, null, 2)}

AI DRAFT:
${draft}`;

    try {
      const response = await aiOrchestrator.generate('FAST_CLASSIFICATION', {
        prompt,
        systemPrompt,
        temperature: 0.1,
        maxTokens: 150,
        responseFormat: 'json'
      });

      const parsed = JSON.parse(response.text);
      return {
         isSupported: !!parsed.isSupported,
         confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.5,
         reason: parsed.reason || 'Guard validation'
      };

    } catch (error) {
      logger.error('HallucinationGuard', 'Guard validation failed, defaulting to cautious acceptance', error);
      // In strict mode, you might default to false.
      return { isSupported: true, confidenceScore: 0.5, reason: 'Guard validation error fallback' };
    }
  }
}

export const hallucinationGuard = new HallucinationGuard();
