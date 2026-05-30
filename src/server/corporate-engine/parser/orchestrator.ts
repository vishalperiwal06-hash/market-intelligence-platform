/**
 * Parsing Orchestrator
 *
 * End-to-end pipeline: PDF → Text → Extraction → Validation → Persist.
 * Ties together all parser sub-systems into a single callable unit.
 */
import { pdfParser } from './pdf-parser';
import { extractionEngine } from './extraction-engine';
import { validationEngine } from './validation-engine';
import { db } from '../../../lib/db';
import { filingDocuments, corporateFilings } from '../../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../../../lib/logger';
import { redis } from '../../../lib/redis';
import { eventBus } from '../../market-engine/scanners/event-bus';
import { kgOrchestrator } from '../../knowledge-graph/kg-orchestrator';

export interface ParseResult {
  filingId: string;
  symbol: string;
  pages: number;
  textLength: number;
  tablesFound: number;
  financialsExtracted: boolean;
  commentaryExtracted: boolean;
  validationWarnings: string[];
  validationErrors: string[];
  confidence: number;
  durationMs: number;
}

export class ParsingOrchestrator {

  async processDocument(filingId: string, symbol: string, filePath: string): Promise<ParseResult> {
    const startTime = Date.now();
    logger.info('ParsingOrchestrator', `Starting parse pipeline for ${symbol} filing ${filingId}`);

    // ── Step 1: Extract raw text ──
    const { text, pages } = await pdfParser.extractText(filePath);

    if (!text || text.trim().length < 50) {
      logger.warn('ParsingOrchestrator', `PDF for ${symbol} yielded negligible text (${text.length} chars). Skipping extraction.`);
      return {
        filingId, symbol, pages, textLength: text.length,
        tablesFound: 0, financialsExtracted: false, commentaryExtracted: false,
        validationWarnings: ['Document text too short for extraction.'],
        validationErrors: [],
        confidence: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Persist raw text to filing_documents table
    await db.update(filingDocuments)
      .set({ extractedText: text, pageCount: pages, processedAt: new Date() })
      .where(eq(filingDocuments.filingId, filingId));

    // ── Step 2: Table extraction ──
    const tables = pdfParser.extractTables(text);

    // ── Step 3: Financial metric extraction (AI-powered) ──
    let financialsExtracted = false;
    let financialValidation = { isValid: true, confidence: 0, warnings: [] as string[], errors: [] as string[] };
    try {
      const financials = await extractionEngine.extractFinancials(filingId, symbol, text);
      if (financials) {
        financialsExtracted = true;
        financialValidation = validationEngine.validateFinancials(financials);
        if (!financialValidation.isValid) {
          logger.warn('ParsingOrchestrator', `Financial validation failed for ${symbol}`, financialValidation.errors);
        }
      }
    } catch (err) {
      logger.error('ParsingOrchestrator', `Financial extraction failed for ${symbol}`, err);
      financialValidation.errors.push('Financial extraction threw an error.');
    }

    // ── Step 4: Management commentary extraction (AI-powered) ──
    let commentaryExtracted = false;
    let commentaryValidation = { isValid: true, confidence: 0, warnings: [] as string[], errors: [] as string[] };
    try {
      const commentary = await extractionEngine.extractCommentary(filingId, symbol, text);
      if (commentary && commentary.length > 0) {
        commentaryExtracted = true;
        commentaryValidation = validationEngine.validateCommentary(commentary);
      }
    } catch (err) {
      logger.error('ParsingOrchestrator', `Commentary extraction failed for ${symbol}`, err);
      commentaryValidation.errors.push('Commentary extraction threw an error.');
    }

    // ── Step 5: Aggregate confidence ──
    const avgConfidence = financialsExtracted && commentaryExtracted
      ? (financialValidation.confidence + commentaryValidation.confidence) / 2
      : financialValidation.confidence || commentaryValidation.confidence || 0;

    const durationMs = Date.now() - startTime;

    // ── Step 6: Observability metrics ──
    await redis.hset('parsing:metrics', {
      [`${symbol}:last_duration_ms`]: durationMs.toString(),
      [`${symbol}:last_confidence`]: avgConfidence.toFixed(2),
      [`${symbol}:last_parsed_at`]: new Date().toISOString(),
      [`${symbol}:pages`]: pages.toString(),
    });

    // ── Step 7: Emit event for downstream consumers ──
    await eventBus.publish('corporate:parsed', {
      filingId, symbol, confidence: avgConfidence,
      financialsExtracted, commentaryExtracted,
    });

    // ── Step 8: Asynchronously trigger Knowledge Graph enrichment ──
    // Fire-and-forget: KG enrichment runs in background and does not block parse result
    setImmediate(() => {
      kgOrchestrator.processDocument({
        text,
        contextSymbol: symbol,
        period: new Date().getFullYear().toString(),
        sourceType: 'FILING',
        sourceId: filingId,
        sourceDate: new Date(),
        eventType: 'EARNINGS',
        eventTitle: `Filing parsed for ${symbol}`,
      }).catch(err => logger.error('ParsingOrchestrator', 'KG enrichment failed', err));
    });

    const result: ParseResult = {
      filingId, symbol, pages,
      textLength: text.length,
      tablesFound: tables.length,
      financialsExtracted,
      commentaryExtracted,
      validationWarnings: [...financialValidation.warnings, ...commentaryValidation.warnings],
      validationErrors: [...financialValidation.errors, ...commentaryValidation.errors],
      confidence: avgConfidence,
      durationMs,
    };

    logger.info('ParsingOrchestrator', `Completed parse for ${symbol} in ${durationMs}ms (confidence: ${(avgConfidence * 100).toFixed(0)}%)`);
    return result;
  }
}

export const parsingOrchestrator = new ParsingOrchestrator();
