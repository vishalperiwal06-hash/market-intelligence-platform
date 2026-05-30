/**
 * Financial Extraction Validation Engine
 * 
 * Validates extracted financial metrics for sanity.
 * NEVER fabricates or corrects values — only flags anomalies.
 */
import { logger } from '../../../lib/logger';

export interface ValidationResult {
  isValid: boolean;
  confidence: number; // 0–1
  warnings: string[];
  errors: string[];
}

export class ValidationEngine {

  /**
   * Validate extracted financial metrics for basic sanity.
   * Does NOT correct or infer — only reports anomalies.
   */
  validateFinancials(extracted: {
    revenue?: number | null;
    pat?: number | null;
    ebitda?: number | null;
    operatingMargin?: number | null;
    yoyGrowth?: number | null;
    qoqGrowth?: number | null;
  }): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    let confidence = 1.0;

    // Rule 1: If revenue is present, it should be positive
    if (extracted.revenue !== null && extracted.revenue !== undefined) {
      if (extracted.revenue < 0) {
        warnings.push('Revenue is negative — verify source document.');
        confidence -= 0.15;
      }
      if (extracted.revenue > 500000) {
        warnings.push('Revenue exceeds ₹5L Cr — verify currency/unit normalization.');
        confidence -= 0.10;
      }
    } else {
      warnings.push('Revenue not extracted.');
      confidence -= 0.20;
    }

    // Rule 2: PAT should not exceed revenue
    if (extracted.revenue && extracted.pat && extracted.pat > extracted.revenue) {
      errors.push('PAT exceeds Revenue — likely extraction error.');
      confidence -= 0.30;
    }

    // Rule 3: EBITDA should not exceed revenue
    if (extracted.revenue && extracted.ebitda && extracted.ebitda > extracted.revenue) {
      errors.push('EBITDA exceeds Revenue — likely extraction error.');
      confidence -= 0.25;
    }

    // Rule 4: Operating margin should be -100% to 100%
    if (extracted.operatingMargin !== null && extracted.operatingMargin !== undefined) {
      if (extracted.operatingMargin < -100 || extracted.operatingMargin > 100) {
        errors.push(`Operating margin ${extracted.operatingMargin}% is out of range.`);
        confidence -= 0.20;
      }
    }

    // Rule 5: YoY / QoQ growth should be plausible (-90% to +500%)
    if (extracted.yoyGrowth !== null && extracted.yoyGrowth !== undefined) {
      if (extracted.yoyGrowth < -90 || extracted.yoyGrowth > 500) {
        warnings.push(`YoY growth ${extracted.yoyGrowth}% is extreme — verify.`);
        confidence -= 0.10;
      }
    }

    if (extracted.qoqGrowth !== null && extracted.qoqGrowth !== undefined) {
      if (extracted.qoqGrowth < -90 || extracted.qoqGrowth > 500) {
        warnings.push(`QoQ growth ${extracted.qoqGrowth}% is extreme — verify.`);
        confidence -= 0.10;
      }
    }

    // Rule 6: At least one metric must be present
    const hasAny = extracted.revenue || extracted.pat || extracted.ebitda;
    if (!hasAny) {
      errors.push('No financial metrics were extracted from this document.');
      confidence = 0;
    }

    confidence = Math.max(0, Math.min(1, confidence));

    return {
      isValid: errors.length === 0,
      confidence,
      warnings,
      errors,
    };
  }

  /**
   * Validate commentary extraction for completeness.
   */
  validateCommentary(items: { topic: string; commentary: string }[]): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    let confidence = 1.0;

    if (items.length === 0) {
      warnings.push('No management commentary extracted.');
      confidence = 0.2;
    }

    for (const item of items) {
      if (!item.commentary || item.commentary.length < 10) {
        warnings.push(`Commentary for topic "${item.topic}" is too short to be meaningful.`);
        confidence -= 0.10;
      }
      if (item.commentary && item.commentary.length > 5000) {
        warnings.push(`Commentary for topic "${item.topic}" is unusually long — may contain raw text dump.`);
        confidence -= 0.05;
      }
    }

    confidence = Math.max(0, Math.min(1, confidence));

    return {
      isValid: errors.length === 0,
      confidence,
      warnings,
      errors,
    };
  }
}

export const validationEngine = new ValidationEngine();
