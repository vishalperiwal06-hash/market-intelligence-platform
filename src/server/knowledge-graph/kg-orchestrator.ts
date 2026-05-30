/**
 * Knowledge Graph — Orchestrator
 *
 * Main pipeline that chains:
 * 1. Entity Extraction (from text via DeepSeek)
 * 2. Entity Deduplication & Persistence
 * 3. Evidence-backed Relationship Creation
 * 4. Thematic Classification
 * 5. Management Guidance Recording
 * 6. Company Timeline Event Creation
 * 7. Observability Diagnostics
 *
 * Called automatically after document parsing is complete.
 * Triggered by: parsing-orchestrator, news ingester, filing ingester.
 */
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { kgEntityExtractor } from './entity-extractor';
import { kgPersistence } from './graph-persistence';

export interface KGOrchestrationInput {
  text: string;
  contextSymbol: string;
  period: string;
  sourceType: 'FILING' | 'NEWS' | 'COMMENTARY' | 'ANNUAL_REPORT' | 'CONCALL';
  sourceId: string;
  sourceDate: Date;
  eventType?: string; // EARNINGS | CONCALL | NEWS | ACQUISITION etc.
  eventTitle?: string;
}

export class KGOrchestrator {
  /**
   * Full KG enrichment pipeline for a document.
   */
  async processDocument(input: KGOrchestrationInput): Promise<void> {
    const startMs = Date.now();
    const diagKey = `kg:processing:${input.sourceId}`;

    try {
      // Mark as in-progress
      await redis.set(diagKey, JSON.stringify({ status: 'running', startedAt: new Date().toISOString() }), 'EX', 3600);

      logger.info('KGOrchestrator', `Starting KG extraction for ${input.contextSymbol} / ${input.sourceId}`);

      // Step 1: Extract all KG elements via AI
      const extracted = await kgEntityExtractor.extractAll(
        input.text,
        input.contextSymbol,
        input.period,
        input.sourceType,
      );

      // Step 2: Persist entities and build lookup map (name → ID)
      const entityIdMap = new Map<string, string>();
      for (const entity of extracted.entities) {
        const id = await kgPersistence.upsertEntity(entity);
        if (id) {
          entityIdMap.set(entity.normalizedName, id);
          // Record the mention for frequency tracking
          await kgPersistence.recordEntityMention(
            id,
            input.contextSymbol,
            input.sourceType,
            input.sourceId,
            entity.mentionExcerpt,
            input.sourceDate,
          );
        }
      }

      // Step 3: Persist evidence-backed relationships
      for (const rel of extracted.relationships) {
        const fromId = entityIdMap.get(kgEntityExtractor.normalizeEntityName(rel.fromEntityName));
        const toId = entityIdMap.get(kgEntityExtractor.normalizeEntityName(rel.toEntityName));

        if (!fromId || !toId) {
          // Entity wasn't persisted (extraction failed or invalid) — skip
          logger.debug('KGOrchestrator', `Skipping relationship — entity not found: ${rel.fromEntityName} → ${rel.toEntityName}`);
          continue;
        }

        await kgPersistence.upsertRelationship(fromId, toId, rel, input.sourceType, input.sourceId);
      }

      // Step 4: Thematic exposure
      for (const theme of extracted.themes) {
        await kgPersistence.upsertThematicExposure(input.contextSymbol, theme, input.sourceDate);
      }

      // Step 5: Management guidance
      for (const guidance of extracted.guidance) {
        await kgPersistence.recordManagementGuidance(
          input.contextSymbol,
          input.period,
          guidance,
          input.sourceType,
          input.sourceId,
          input.sourceDate,
        );
      }

      // Step 6: Company Timeline Event
      if (input.eventType && input.eventTitle) {
        const significance = this.assessSignificance(input.sourceType, extracted);
        await kgPersistence.addTimelineEvent(
          input.contextSymbol,
          input.eventType,
          input.eventTitle,
          `${extracted.entities.length} entities, ${extracted.themes.length} themes, ${extracted.guidance.length} guidance items extracted`,
          significance,
          input.sourceType,
          input.sourceDate,
          input.sourceId,
          {
            entitiesCount: extracted.entities.length,
            relationshipsCount: extracted.relationships.length,
            themesCount: extracted.themes.length,
            guidanceCount: extracted.guidance.length,
          },
        );
      }

      const processingMs = Date.now() - startMs;

      // Step 7: Diagnostics
      await kgPersistence.recordDiagnostic(
        'FULL_EXTRACTION',
        input.sourceId,
        {
          entities: extracted.entities.length,
          relationships: extracted.relationships.length,
          themes: extracted.themes.length,
          guidance: extracted.guidance.length,
        },
        processingMs,
      );

      // Update Redis diagnostics counters
      await redis.hincrby('kg:totals', 'entities_extracted', extracted.entities.length);
      await redis.hincrby('kg:totals', 'relationships_extracted', extracted.relationships.length);
      await redis.hincrby('kg:totals', 'themes_classified', extracted.themes.length);
      await redis.hincrby('kg:totals', 'guidance_extracted', extracted.guidance.length);
      await redis.hincrby('kg:totals', 'documents_processed', 1);

      // Mark complete
      await redis.set(diagKey, JSON.stringify({
        status: 'complete',
        processingMs,
        extracted: {
          entities: extracted.entities.length,
          relationships: extracted.relationships.length,
          themes: extracted.themes.length,
          guidance: extracted.guidance.length,
        },
        completedAt: new Date().toISOString(),
      }), 'EX', 86400);

      logger.info('KGOrchestrator', `KG extraction complete for ${input.contextSymbol}`, {
        entities: extracted.entities.length,
        relationships: extracted.relationships.length,
        themes: extracted.themes.length,
        guidance: extracted.guidance.length,
        processingMs,
      });

    } catch (error) {
      const processingMs = Date.now() - startMs;
      logger.error('KGOrchestrator', `KG extraction failed for ${input.contextSymbol}`, error);

      await kgPersistence.recordDiagnostic(
        'FULL_EXTRACTION',
        input.sourceId,
        { entities: 0, relationships: 0, themes: 0, guidance: 0 },
        processingMs,
        error instanceof Error ? error.message : String(error),
      );

      await redis.hincrby('kg:totals', 'documents_failed', 1);
      await redis.set(diagKey, JSON.stringify({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        processingMs,
      }), 'EX', 86400);
    }
  }

  private assessSignificance(
    sourceType: string,
    extracted: { guidance: unknown[]; entities: unknown[]; themes: unknown[] },
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (sourceType === 'FILING' && extracted.guidance.length > 0) return 'HIGH';
    if (sourceType === 'CONCALL') return 'HIGH';
    if (extracted.themes.length >= 3 || extracted.guidance.length >= 2) return 'MEDIUM';
    return 'LOW';
  }
}

export const kgOrchestrator = new KGOrchestrator();
