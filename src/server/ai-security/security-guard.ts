/**
 * AI Security Layer — Prompt Injection & Abuse Prevention
 * Phase 16 — Production Hardening
 *
 * The copilot must NEVER:
 * - Execute code
 * - Reveal secrets / API keys
 * - Expose raw Redis keys or embeddings
 * - Leak system prompts
 */
import { logger } from '../../lib/logger';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior/i,
  /you\s+are\s+now\s+a/i,
  /system\s*:\s*/i,
  /\bact\s+as\b/i,
  /reveal\s+(your|the)\s+(system|initial)\s+prompt/i,
  /what\s+(is|are)\s+your\s+(instructions|rules|system\s+prompt)/i,
  /output\s+(your|the)\s+(api|secret)\s+key/i,
  /print\s+(env|process\.env|environment)/i,
  /\bexec\s*\(/i,
  /\beval\s*\(/i,
  /```\s*(bash|sh|python|javascript|node)/i,
  /import\s+os/i,
  /require\s*\(\s*['"]child_process/i,
  /REDIS_URL|DATABASE_URL|API_KEY|SECRET/i,
];

const JAILBREAK_PHRASES = [
  'DAN mode',
  'developer mode',
  'do anything now',
  'ignore safety',
  'bypass filters',
  'unrestricted mode',
  'sudo mode',
  'override safety',
];

export interface SecurityScanResult {
  isSafe: boolean;
  threat: string | null;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export class AISecurityGuard {
  /**
   * Scans user input for prompt injection, jailbreak attempts, and credential leaks.
   */
  scanInput(input: string): SecurityScanResult {
    if (!input || input.trim().length === 0) {
      return { isSafe: true, threat: null, severity: 'none' };
    }

    // 1. Check regex injection patterns
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        logger.warn('AISecurityGuard', `Prompt injection detected: ${pattern.source}`);
        return { isSafe: false, threat: 'PROMPT_INJECTION', severity: 'critical' };
      }
    }

    // 2. Check jailbreak phrases
    const lowerInput = input.toLowerCase();
    for (const phrase of JAILBREAK_PHRASES) {
      if (lowerInput.includes(phrase.toLowerCase())) {
        logger.warn('AISecurityGuard', `Jailbreak attempt detected: "${phrase}"`);
        return { isSafe: false, threat: 'JAILBREAK_ATTEMPT', severity: 'high' };
      }
    }

    // 3. Check for excessively long inputs (potential buffer abuse)
    if (input.length > 10000) {
      logger.warn('AISecurityGuard', 'Input exceeds maximum safe length');
      return { isSafe: false, threat: 'INPUT_OVERFLOW', severity: 'medium' };
    }

    return { isSafe: true, threat: null, severity: 'none' };
  }

  /**
   * Scans AI provider output to prevent credential/key leakage.
   */
  scanOutput(output: string): SecurityScanResult {
    if (!output) return { isSafe: true, threat: null, severity: 'none' };

    const leakPatterns = [
      /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,  // JWT-like
      /sk-[A-Za-z0-9]{20,}/,                                           // OpenAI key
      /redis:\/\/[^\s]+/i,                                              // Redis URL
      /postgres(ql)?:\/\/[^\s]+/i,                                      // PG URL
      /Bearer\s+[A-Za-z0-9._~+\/-]+=*/,                               // Auth header
    ];

    for (const pattern of leakPatterns) {
      if (pattern.test(output)) {
        logger.error('AISecurityGuard', 'AI OUTPUT CONTAINS POTENTIAL CREDENTIAL LEAK — BLOCKED');
        return { isSafe: false, threat: 'CREDENTIAL_LEAK', severity: 'critical' };
      }
    }

    return { isSafe: true, threat: null, severity: 'none' };
  }

  /**
   * Sanitizes user-supplied text for safe DB insertion and rendering.
   */
  sanitize(input: string): string {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
}

export const aiSecurityGuard = new AISecurityGuard();
