/**
 * Knowledge Graph — Graph Persistence Engine
 *
 * Handles all database operations for the knowledge graph.
 * Implements:
 * - Entity deduplication and linking
 * - Evidence-backed relationship creation
 * - Thematic exposure upserts
 * - Management guidance tracking
 * - Company timeline events
 *
 * ZERO-HALLUCINATION PRINCIPLE:
 * Every relationship written to DB must have a corresponding
 * evidence record. This is enforced at the persistence layer.
 */
import { db } from '../../lib/db';
import {
  kgEntities, kgRelationships, kgRelationshipEvidence,
  kgThematicExposure, kgManagementGuidance, kgCompanyTimeline,
  kgEntityMentions, kgDiagnostics,
} from '../../lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger';
import type {
  ExtractedEntity, ExtractedRelationship,
  ExtractedTheme, ExtractedGuidance,
} from './entity-extractor';

export class KGPersistenceEngine {
  /**
   * Upsert an entity. Returns the entity ID.
   * Deduplication is by (normalizedName, type).
   */
  async upsertEntity(entity: ExtractedEntity): Promise<string | null> {
    try {
      const existing = await db.select({ id: kgEntities.id, aliases: kgEntities.aliases })
        .from(kgEntities)
        .where(and(
          eq(kgEntities.normalizedName, entity.normalizedName),
          eq(kgEntities.type, entity.type),
        ))
        .limit(1);

      if (existing.length > 0) {
        // Entity exists — merge aliases
        const existingAliases = (existing[0].aliases as string[]) || [];
        const newAliases = [...new Set([...existingAliases, ...entity.aliases, entity.name])];
        await db.update(kgEntities)
          .set({
            aliases: newAliases,
            updatedAt: new Date(),
            ...(entity.linkedSymbol ? { linkedSymbol: entity.linkedSymbol } : {}),
          })
          .where(eq(kgEntities.id, existing[0].id));
        return existing[0].id;
      }

      // New entity
      const inserted = await db.insert(kgEntities).values({
        name: entity.name,
        normalizedName: entity.normalizedName,
        type: entity.type,
        aliases: [entity.name, ...entity.aliases],
        linkedSymbol: entity.linkedSymbol || null,
        metadata: entity.metadata,
      }).returning({ id: kgEntities.id });

      return inserted[0]?.id || null;
    } catch (error) {
      logger.error('KGPersistence', `Failed to upsert entity: ${entity.name}`, error);
      return null;
    }
  }

  /**
   * Record an entity mention — raw occurrence log.
   */
  async recordEntityMention(
    entityId: string,
    contextSymbol: string | null,
    sourceType: string,
    sourceId: string,
    excerpt: string,
    mentionedAt: Date,
    sentimentInContext?: number,
  ): Promise<void> {
    try {
      await db.insert(kgEntityMentions).values({
        entityId,
        contextSymbol,
        sourceType,
        sourceId,
        mentionExcerpt: excerpt.substring(0, 500),
        sentimentInContext: sentimentInContext ?? null,
        mentionedAt,
      });
    } catch (error) {
      logger.error('KGPersistence', `Failed to record mention for entity ${entityId}`, error);
    }
  }

  /**
   * Create or strengthen a relationship with mandatory evidence.
   * If the relationship already exists, increments evidence count.
   * RULE: Never created without sourceExcerpt.
   */
  async upsertRelationship(
    fromEntityId: string,
    toEntityId: string,
    relationship: ExtractedRelationship,
    sourceType: string,
    sourceId: string,
  ): Promise<void> {
    try {
      // Check if relationship already exists
      const existing = await db.select({ id: kgRelationships.id, evidenceCount: kgRelationships.evidenceCount })
        .from(kgRelationships)
        .where(and(
          eq(kgRelationships.fromEntityId, fromEntityId),
          eq(kgRelationships.toEntityId, toEntityId),
          eq(kgRelationships.relationshipType, relationship.relationshipType),
        ))
        .limit(1);

      let relId: string;

      if (existing.length > 0) {
        relId = existing[0].id;
        // Strengthen existing relationship
        const newEvCount = (existing[0].evidenceCount || 1) + 1;
        const newConfidence = Math.min(1.0, relationship.confidenceScore + (newEvCount * 0.05));
        await db.update(kgRelationships)
          .set({
            evidenceCount: newEvCount,
            confidenceScore: newConfidence,
            lastSeenAt: new Date(),
          })
          .where(eq(kgRelationships.id, relId));
      } else {
        // Create new relationship
        const inserted = await db.insert(kgRelationships).values({
          fromEntityId,
          toEntityId,
          relationshipType: relationship.relationshipType,
          confidenceScore: relationship.confidenceScore,
          evidenceCount: 1,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        }).returning({ id: kgRelationships.id });
        relId = inserted[0]?.id;
      }

      // MANDATORY: Record evidence (no relationship without evidence)
      if (relId && relationship.sourceExcerpt) {
        await db.insert(kgRelationshipEvidence).values({
          relationshipId: relId,
          sourceType,
          sourceId,
          sourceExcerpt: relationship.sourceExcerpt.substring(0, 1000),
          extractedAt: new Date(),
        });
      }
    } catch (error) {
      logger.error('KGPersistence', `Failed to upsert relationship`, error);
    }
  }

  /**
   * Upsert thematic exposure for a company.
   * Increments mention count and updates confidence on re-encounter.
   */
  async upsertThematicExposure(
    symbol: string,
    theme: ExtractedTheme,
    mentionedAt: Date,
  ): Promise<void> {
    try {
      const existing = await db.select({ id: kgThematicExposure.id, mentionCount: kgThematicExposure.mentionCount })
        .from(kgThematicExposure)
        .where(and(
          eq(kgThematicExposure.symbol, symbol),
          eq(kgThematicExposure.theme, theme.theme),
        ))
        .limit(1);

      if (existing.length > 0) {
        const newCount = (existing[0].mentionCount || 1) + 1;
        const newConfidence = Math.min(1.0, theme.confidenceScore + (newCount * 0.02));
        await db.update(kgThematicExposure)
          .set({
            mentionCount: newCount,
            confidenceScore: newConfidence,
            lastMentionedAt: mentionedAt,
            exposureLevel: theme.exposureLevel, // Update to latest assessment
            evidenceSummary: theme.evidenceSummary,
            updatedAt: new Date(),
          })
          .where(eq(kgThematicExposure.id, existing[0].id));
      } else {
        await db.insert(kgThematicExposure).values({
          symbol,
          theme: theme.theme,
          confidenceScore: theme.confidenceScore,
          exposureLevel: theme.exposureLevel,
          evidenceSummary: theme.evidenceSummary,
          mentionCount: 1,
          firstMentionedAt: mentionedAt,
          lastMentionedAt: mentionedAt,
        });
      }
    } catch (error) {
      logger.error('KGPersistence', `Failed to upsert thematic exposure ${symbol}:${theme.theme}`, error);
    }
  }

  /**
   * Record management guidance.
   * Preserves full lineage with source excerpt.
   */
  async recordManagementGuidance(
    symbol: string,
    period: string,
    guidance: ExtractedGuidance,
    sourceType: string,
    sourceId: string,
    issuedAt: Date,
  ): Promise<void> {
    try {
      await db.insert(kgManagementGuidance).values({
        symbol,
        guidanceType: guidance.guidanceType,
        period,
        guidanceText: guidance.guidanceText,
        quantifiedValue: guidance.quantifiedValue ?? null,
        unit: guidance.unit ?? null,
        sentiment: guidance.sentiment,
        managementTone: guidance.managementTone,
        sourceType,
        sourceId,
        sourceExcerpt: guidance.sourceExcerpt.substring(0, 1000),
        issuedAt,
      });
    } catch (error) {
      logger.error('KGPersistence', `Failed to record guidance for ${symbol}`, error);
    }
  }

  /**
   * Add a company timeline event.
   */
  async addTimelineEvent(
    symbol: string,
    eventType: string,
    title: string,
    description: string,
    significance: 'HIGH' | 'MEDIUM' | 'LOW',
    sourceType: string,
    eventDate: Date,
    sourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await db.insert(kgCompanyTimeline).values({
        symbol,
        eventType,
        title,
        description: description.substring(0, 1000),
        significance,
        sourceType,
        sourceId: sourceId || null,
        eventDate,
        metadata: metadata || {},
      });
    } catch (error) {
      logger.error('KGPersistence', `Failed to add timeline event for ${symbol}`, error);
    }
  }

  /**
   * Record a diagnostic run for observability.
   */
  async recordDiagnostic(
    runType: string,
    sourceId: string,
    counts: {
      entities: number;
      relationships: number;
      themes: number;
      guidance: number;
    },
    processingMs: number,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await db.insert(kgDiagnostics).values({
        runType,
        sourceId,
        entitiesExtracted: counts.entities,
        relationshipsExtracted: counts.relationships,
        themesClassified: counts.themes,
        guidanceItemsExtracted: counts.guidance,
        processingMs,
        errorMessage: errorMessage || null,
      });
    } catch (error) {
      logger.error('KGPersistence', 'Failed to record diagnostic', error);
    }
  }
}

export const kgPersistence = new KGPersistenceEngine();
