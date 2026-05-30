/**
 * Knowledge Graph — Entity Extractor
 *
 * Extracts named entities from text using DeepSeek.
 * STRICT RULES:
 * - Only extract entities explicitly mentioned in the text
 * - Never infer or hallucinate entities
 * - Normalize names for deduplication
 * - Every entity must map to a supported type
 */
import { logger } from '../../lib/logger';
import { aiOrchestrator } from '../ai-orchestrator/orchestrator';

export type EntityType =
  | 'COMPANY'
  | 'SECTOR'
  | 'INDUSTRY'
  | 'PERSON'
  | 'PRODUCT'
  | 'TECHNOLOGY'
  | 'GEOGRAPHY'
  | 'COMMODITY'
  | 'GOVERNMENT_PROGRAM'
  | 'CAPEX_PROJECT';

export interface ExtractedEntity {
  name: string;
  normalizedName: string;
  type: EntityType;
  aliases: string[];
  linkedSymbol?: string;
  mentionExcerpt: string;
  metadata: Record<string, unknown>;
}

export interface ExtractedRelationship {
  fromEntityName: string;
  fromEntityType: EntityType;
  toEntityName: string;
  toEntityType: EntityType;
  relationshipType: string;
  confidenceScore: number;
  sourceExcerpt: string;
}

export interface ExtractedTheme {
  theme: string;
  exposureLevel: 'PRIMARY' | 'SECONDARY' | 'PERIPHERAL';
  confidenceScore: number;
  evidenceSummary: string;
}

export interface ExtractedGuidance {
  guidanceType: string;
  guidanceText: string;
  quantifiedValue?: number;
  unit?: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'CAUTIOUS' | 'NEGATIVE';
  managementTone: number;
  sourceExcerpt: string;
}

export interface KGExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  themes: ExtractedTheme[];
  guidance: ExtractedGuidance[];
}

const SUPPORTED_THEMES = [
  'AI', 'DEFENSE', 'RAILWAYS', 'EV', 'MANUFACTURING', 'SEMICONDUCTORS',
  'LOGISTICS', 'ENERGY', 'INFRASTRUCTURE', 'PLI', 'CHINA_PLUS_ONE',
  'DATA_CENTERS', 'RENEWABLE', 'PHARMA', 'AGRI', 'REAL_ESTATE',
  'FINTECH', 'EXPORT', 'IMPORT_SUBSTITUTION',
];

const RELATIONSHIP_TYPES = [
  'SUPPLIER_OF', 'CUSTOMER_OF', 'PEER_OF', 'SUBSIDIARY_OF', 'PARENT_OF',
  'EXPOSED_TO', 'COMPETES_WITH', 'COLLABORATES_WITH', 'JOINT_VENTURE_WITH',
  'REGULATED_BY', 'DEPENDENT_ON',
];

export class KGEntityExtractor {
  constructor() {}

  /**
   * Full KG extraction from a block of text.
   * Extracts entities, relationships, themes, and guidance in one AI call.
   */
  async extractAll(
    text: string,
    contextSymbol: string,
    contextPeriod: string,
    sourceType: string,
  ): Promise<KGExtractionResult> {

    // Limit text to avoid token overflow — use most meaningful 4000 chars
    const truncatedText = text.length > 4000 ? text.substring(0, 4000) : text;

    const prompt = `You are an institutional financial analyst performing structured entity extraction.
Extract ONLY entities, relationships, themes, and guidance that are EXPLICITLY stated in this text.
DO NOT infer, hallucinate, or assume any relationships or entities not directly mentioned.

CONTEXT: Company ${contextSymbol}, Period ${contextPeriod}, Source: ${sourceType}

TEXT:
${truncatedText}

SUPPORTED THEMES: ${SUPPORTED_THEMES.join(', ')}
SUPPORTED RELATIONSHIP TYPES: ${RELATIONSHIP_TYPES.join(', ')}

Return ONLY valid JSON in this exact structure (no markdown, no explanation):
{
  "entities": [
    {
      "name": "exact name as written",
      "normalizedName": "lowercase normalized",
      "type": "COMPANY|SECTOR|INDUSTRY|PERSON|PRODUCT|TECHNOLOGY|GEOGRAPHY|COMMODITY|GOVERNMENT_PROGRAM|CAPEX_PROJECT",
      "aliases": [],
      "linkedSymbol": "NSE_SYMBOL_IF_APPLICABLE_OR_NULL",
      "mentionExcerpt": "exact sentence containing this entity",
      "metadata": {}
    }
  ],
  "relationships": [
    {
      "fromEntityName": "entity name",
      "fromEntityType": "entity type",
      "toEntityName": "entity name",
      "toEntityType": "entity type",
      "relationshipType": "one of supported types",
      "confidenceScore": 0.0_to_1.0,
      "sourceExcerpt": "exact sentence supporting this relationship"
    }
  ],
  "themes": [
    {
      "theme": "one of supported themes",
      "exposureLevel": "PRIMARY|SECONDARY|PERIPHERAL",
      "confidenceScore": 0.0_to_1.0,
      "evidenceSummary": "brief description of evidence"
    }
  ],
  "guidance": [
    {
      "guidanceType": "REVENUE|MARGIN|CAPEX|VOLUME|EBITDA|CUSTOM",
      "guidanceText": "exact words of the guidance",
      "quantifiedValue": number_or_null,
      "unit": "%|Cr|MW|null",
      "sentiment": "POSITIVE|NEUTRAL|CAUTIOUS|NEGATIVE",
      "managementTone": -1.0_to_1.0,
      "sourceExcerpt": "exact sentence containing this guidance"
    }
  ]
}

STRICT RULES:
- entities array: only explicitly named entities in text. Empty array [] if none found.
- relationships array: only relationships explicitly supported by text. Empty array [] if none.
- themes array: only themes the company is explicitly discussing or exposed to. Empty array [] if none.
- guidance array: only forward-looking quantifiable or qualitative statements. Empty array [] if none.
- Every relationship MUST have a sourceExcerpt with the supporting sentence.
- confidenceScore reflects how explicit (not inferred) the relationship is.`;

    try {
      const response = await aiOrchestrator.generate('PARSING', {
        prompt,
        temperature: 0.1,
        maxTokens: 3000,
        responseFormat: 'json'
      });

      const content = response.text;
      if (!content) return { entities: [], relationships: [], themes: [], guidance: [] };

      const parsed = JSON.parse(content) as KGExtractionResult;

      // Validate and filter results
      return this.validateAndFilter(parsed);
    } catch (error) {
      logger.error('KGEntityExtractor', 'Extraction failed', error);
      return { entities: [], relationships: [], themes: [], guidance: [] };
    }
  }

  /**
   * Validate extracted results against supported types.
   * Removes anything that doesn't conform to our schema.
   */
  private validateAndFilter(raw: KGExtractionResult): KGExtractionResult {
    const validEntityTypes: EntityType[] = [
      'COMPANY', 'SECTOR', 'INDUSTRY', 'PERSON', 'PRODUCT',
      'TECHNOLOGY', 'GEOGRAPHY', 'COMMODITY', 'GOVERNMENT_PROGRAM', 'CAPEX_PROJECT',
    ];

    const entities = (raw.entities || []).filter(e =>
      e.name && e.normalizedName && validEntityTypes.includes(e.type) && e.mentionExcerpt
    );

    const relationships = (raw.relationships || []).filter(r =>
      r.fromEntityName && r.toEntityName &&
      RELATIONSHIP_TYPES.includes(r.relationshipType) &&
      r.sourceExcerpt &&
      r.confidenceScore >= 0.3 // Reject low-confidence relationships
    );

    const themes = (raw.themes || []).filter(t =>
      SUPPORTED_THEMES.includes(t.theme) &&
      ['PRIMARY', 'SECONDARY', 'PERIPHERAL'].includes(t.exposureLevel) &&
      t.confidenceScore >= 0.3
    );

    const guidance = (raw.guidance || []).filter(g =>
      g.guidanceText && g.sourceExcerpt &&
      ['POSITIVE', 'NEUTRAL', 'CAUTIOUS', 'NEGATIVE'].includes(g.sentiment)
    );

    return { entities, relationships, themes, guidance };
  }

  normalizeEntityName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }
}

export const kgEntityExtractor = new KGEntityExtractor();
