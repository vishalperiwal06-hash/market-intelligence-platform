import {
  pgTable,
  text,
  timestamp,
  doublePrecision,
  bigint,
  uuid,
  index,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  serial,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ──────────────────────────────────────────────
// COMPANY MASTER
// ──────────────────────────────────────────────
export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull().unique(),
  name: text('name').notNull(),
  sector: text('sector'),
  industry: text('industry'),
  marketCap: doublePrecision('market_cap'),
  exchange: text('exchange').notNull().default('NSE'),
  isActive: boolean('is_active').default(true),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ──────────────────────────────────────────────
// TICK HISTORY — raw ingestion snapshots
// Every genuine tick from the live pipeline is persisted here.
// Partition-ready: designed for range-based partitioning on timestamp.
// ──────────────────────────────────────────────
export const tickHistory = pgTable('tick_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  price: doublePrecision('price').notNull(),
  change: doublePrecision('change'),
  changePercent: doublePrecision('change_percent'),
  volume: bigint('volume', { mode: 'number' }),
  turnover: doublePrecision('turnover'),
  high: doublePrecision('high'),
  low: doublePrecision('low'),
  open: doublePrecision('open'),
  close: doublePrecision('close'),
  exchange: text('exchange').default('NSE'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('tick_history_symbol_idx').on(table.symbol),
  timestampIdx: index('tick_history_ts_idx').on(table.timestamp),
  symbolTimestampIdx: index('tick_history_sym_ts_idx').on(table.symbol, table.timestamp),
}));

// ──────────────────────────────────────────────
// OHLC CANDLES — aggregated from genuine tick history only
// timeframe: '1m' | '5m' | '15m' | '1h' | '1d'
// ──────────────────────────────────────────────
export const ohlcCandles = pgTable('ohlc_candles', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(), // '1m','5m','15m','1h','1d'
  open: doublePrecision('open').notNull(),
  high: doublePrecision('high').notNull(),
  low: doublePrecision('low').notNull(),
  close: doublePrecision('close').notNull(),
  volume: bigint('volume', { mode: 'number' }).default(0),
  turnover: doublePrecision('turnover').default(0),
  tickCount: integer('tick_count').default(0),
  bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
  bucketEnd: timestamp('bucket_end', { withTimezone: true }).notNull(),
}, (table) => ({
  symbolIdx: index('ohlc_symbol_idx').on(table.symbol),
  timeframeIdx: index('ohlc_timeframe_idx').on(table.timeframe),
  bucketIdx: index('ohlc_bucket_idx').on(table.bucketStart),
  symbolTfBucketIdx: uniqueIndex('ohlc_sym_tf_bucket_uniq').on(table.symbol, table.timeframe, table.bucketStart),
}));

// ──────────────────────────────────────────────
// TECHNICAL INDICATORS — precomputed by background workers
// ──────────────────────────────────────────────
export const technicalIndicators = pgTable('technical_indicators', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),

  // Moving Averages
  ema20: doublePrecision('ema20'),
  ema50: doublePrecision('ema50'),
  ema200: doublePrecision('ema200'),

  // RSI
  rsi14: doublePrecision('rsi14'),

  // MACD
  macdLine: doublePrecision('macd_line'),
  macdSignal: doublePrecision('macd_signal'),
  macdHistogram: doublePrecision('macd_histogram'),

  // Bollinger Bands
  bbUpper: doublePrecision('bb_upper'),
  bbMiddle: doublePrecision('bb_middle'),
  bbLower: doublePrecision('bb_lower'),

  // VWAP
  vwap: doublePrecision('vwap'),

  // ATR
  atr14: doublePrecision('atr14'),

  // Relative Strength (vs index)
  relativeStrength: doublePrecision('relative_strength'),

  // Volume Analytics
  volumeSma20: doublePrecision('volume_sma20'),
  volumeSpike: boolean('volume_spike').default(false),

  // Breakout Detection
  breakoutDetected: boolean('breakout_detected').default(false),
  breakoutType: text('breakout_type'), // 'resistance' | 'support' | null
}, (table) => ({
  symbolIdx: index('ti_symbol_idx').on(table.symbol),
  timestampIdx: index('ti_ts_idx').on(table.timestamp),
  symbolTfTsIdx: uniqueIndex('ti_sym_tf_ts_uniq').on(table.symbol, table.timeframe, table.timestamp),
}));

// ──────────────────────────────────────────────
// MARKET BREADTH HISTORY
// ──────────────────────────────────────────────
export const breadthHistory = pgTable('breadth_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  advances: integer('advances').notNull(),
  declines: integer('declines').notNull(),
  unchanged: integer('unchanged').notNull(),
  advanceDeclineRatio: doublePrecision('ad_ratio'),
  newHighs: integer('new_highs').default(0),
  newLows: integer('new_lows').default(0),
  pctAboveEma20: doublePrecision('pct_above_ema20'),
  pctAboveVwap: doublePrecision('pct_above_vwap'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tsIdx: index('breadth_ts_idx').on(table.timestamp),
}));

// ──────────────────────────────────────────────
// SECTOR STRENGTH / ROTATION HISTORY
// ──────────────────────────────────────────────
export const sectorHistory = pgTable('sector_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  sector: text('sector').notNull(),
  avgChange: doublePrecision('avg_change').notNull(),
  totalTurnover: doublePrecision('total_turnover').default(0),
  totalVolume: bigint('total_volume', { mode: 'number' }).default(0),
  advances: integer('advances').default(0),
  declines: integer('declines').default(0),
  rank: integer('rank'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sectorIdx: index('sector_hist_sector_idx').on(table.sector),
  tsIdx: index('sector_hist_ts_idx').on(table.timestamp),
}));

// ──────────────────────────────────────────────
// INDEX SNAPSHOTS
// ──────────────────────────────────────────────
export const indexSnapshots = pgTable('index_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  indexName: text('index_name').notNull(), // 'NIFTY50','BANKNIFTY','SENSEX'...
  value: doublePrecision('value').notNull(),
  change: doublePrecision('change'),
  changePercent: doublePrecision('change_percent'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('idx_snap_name_idx').on(table.indexName),
  tsIdx: index('idx_snap_ts_idx').on(table.timestamp),
}));

// ──────────────────────────────────────────────
// MARKET SNAPSHOTS — periodic full-market state captures
// ──────────────────────────────────────────────
export const marketSnapshots = pgTable('market_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  snapshotType: text('snapshot_type').notNull(), // 'eod', 'hourly', 'breadth'
  data: jsonb('data').notNull(), // Full JSON payload of the snapshot
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  typeIdx: index('mkt_snap_type_idx').on(table.snapshotType),
  tsIdx: index('mkt_snap_ts_idx').on(table.timestamp),
}));

// ──────────────────────────────────────────────
// FILINGS (existing, kept intact)
// ──────────────────────────────────────────────
export const filings = pgTable('filings', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  title: text('title').notNull(),
  category: text('category'),
  pdfUrl: text('pdf_url'),
  timestamp: timestamp('timestamp').notNull(),
  aiSummary: text('ai_summary'),
  sentiment: text('sentiment'),
});

// ──────────────────────────────────────────────
// NEWS (existing, kept intact)
// ──────────────────────────────────────────────
export const news = pgTable('news', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  summary: text('summary'),
  source: text('source'),
  url: text('url'),
  relatedSymbols: text('related_symbols').array(),
  timestamp: timestamp('timestamp').defaultNow(),
});

// ──────────────────────────────────────────────
// TRADE JOURNAL (existing, kept intact)
// ──────────────────────────────────────────────
export const tradeJournal = pgTable('trade_journal', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  type: text('type').notNull(),
  entryPrice: doublePrecision('entry_price').notNull(),
  exitPrice: doublePrecision('exit_price'),
  stopLoss: doublePrecision('stop_loss'),
  target: doublePrecision('target'),
  pnl: doublePrecision('pnl'),
  notes: text('notes'),
  aiInsight: text('ai_insight'),
  timestamp: timestamp('timestamp').defaultNow(),
});

// ──────────────────────────────────────────────
// ACTIVE SIGNALS — Realtime scanner results
// ──────────────────────────────────────────────
export const activeSignals = pgTable('active_signals', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  signalType: text('signal_type').notNull(), // 'momentum', 'breakout', 'volume', etc.
  signalName: text('signal_name').notNull(), // e.g. 'RSI Oversold', 'Resistance Breakout'
  direction: text('direction').notNull(), // 'bullish', 'bearish'
  timeframe: text('timeframe').notNull(), // '1m', '5m', '15m', '1h', '1d'
  confidence: doublePrecision('confidence').notNull(), // 0-100
  qualityScore: doublePrecision('quality_score'), // 0-100
  riskScore: doublePrecision('risk_score'), // 0-100
  priceAtDetection: doublePrecision('price_at_detection').notNull(),
  metadata: jsonb('metadata'), // Any extra data
  traceId: uuid('trace_id'),
  correlationId: uuid('correlation_id'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => ({
  symbolIdx: index('active_sig_symbol_idx').on(table.symbol),
  typeIdx: index('active_sig_type_idx').on(table.signalType),
  timeframeIdx: index('active_sig_tf_idx').on(table.timeframe),
  tsIdx: index('active_sig_ts_idx').on(table.timestamp),
  symTypeNameTfIdx: uniqueIndex('active_sig_uniq').on(table.symbol, table.signalType, table.signalName, table.timeframe),
}));

// ──────────────────────────────────────────────
// SIGNAL HISTORY — For backtesting and tracking
// ──────────────────────────────────────────────
export const signalHistory = pgTable('signal_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  signalType: text('signal_type').notNull(),
  signalName: text('signal_name').notNull(),
  direction: text('direction').notNull(),
  timeframe: text('timeframe').notNull(),
  confidence: doublePrecision('confidence').notNull(),
  priceAtDetection: doublePrecision('price_at_detection').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('sig_hist_symbol_idx').on(table.symbol),
  tsIdx: index('sig_hist_ts_idx').on(table.timestamp),
}));

// ──────────────────────────────────────────────
// MARKET LEADERSHIP / RANKING SNAPSHOTS
// ──────────────────────────────────────────────
export const rankingSnapshots = pgTable('ranking_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  rankingType: text('ranking_type').notNull(), // 'strongest_stocks', 'momentum_leaders'
  data: jsonb('data').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  typeIdx: index('rank_snap_type_idx').on(table.rankingType),
  tsIdx: index('rank_snap_ts_idx').on(table.timestamp),
}));

// ──────────────────────────────────────────────
// AI INTELLIGENCE LAYER
// ──────────────────────────────────────────────

export const aiSignalAnalysis = pgTable('ai_signal_analysis', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  signalId: text('signal_id').notNull(),
  signalType: text('signal_type').notNull(),
  explanation: text('explanation').notNull(),
  confidence: doublePrecision('confidence'),
  risks: text('risks'),
  modelUsed: text('model_used').notNull(),
  tokensUsed: integer('tokens_used').default(0),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('ai_sig_symbol_idx').on(table.symbol),
  tsIdx: index('ai_sig_ts_idx').on(table.timestamp),
}));

export const aiMarketNarratives = pgTable('ai_market_narratives', {
  id: uuid('id').defaultRandom().primaryKey(),
  narrativeType: text('narrative_type').notNull(), // 'intraday', 'eod', 'sector'
  content: text('content').notNull(),
  sentimentScore: doublePrecision('sentiment_score'), // -1 to 1
  modelUsed: text('model_used').notNull(),
  tokensUsed: integer('tokens_used').default(0),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  typeIdx: index('ai_narr_type_idx').on(table.narrativeType),
  tsIdx: index('ai_narr_ts_idx').on(table.timestamp),
}));

export const aiCompanyProfiles = pgTable('ai_company_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  businessSummary: text('business_summary'),
  strengths: text('strengths'),
  weaknesses: text('weaknesses'),
  sectorPositioning: text('sector_positioning'),
  modelUsed: text('model_used').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  symbolUniq: uniqueIndex('ai_comp_symbol_uniq').on(table.symbol),
}));

// ──────────────────────────────────────────────
// CORPORATE INTELLIGENCE LAYER
// ──────────────────────────────────────────────

export const corporateFilings = pgTable('corporate_filings', {
  id: uuid('id').defaultRandom().primaryKey(),
  exchange: text('exchange').notNull(), // 'NSE', 'BSE'
  symbol: text('symbol').notNull(),
  companyName: text('company_name').notNull(),
  category: text('category').notNull(), // 'Financial Results', 'Board Meeting', 'Dividends'
  subject: text('subject').notNull(),
  details: text('details'),
  broadcastDate: timestamp('broadcast_date', { withTimezone: true }).notNull(),
  receiptDate: timestamp('receipt_date', { withTimezone: true }).notNull(),
  pdfUrl: text('pdf_url'), // Original source URL
  priceAtAnnouncement: doublePrecision('price_at_announcement'),
  reflectedAt: timestamp('reflected_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  symbolIdx: index('filing_symbol_idx').on(table.symbol),
  categoryIdx: index('filing_category_idx').on(table.category),
  broadcastIdx: index('filing_broadcast_idx').on(table.broadcastDate),
  // Deduplication hash index usually added via unique constraint on combination
  uniqueFiling: uniqueIndex('filing_uniq').on(table.exchange, table.symbol, table.broadcastDate),
}));

export const filingDocuments = pgTable('filing_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  filingId: uuid('filing_id').references(() => corporateFilings.id).notNull(),
  s3Key: text('s3_key'), // If we store it in S3
  documentHash: text('document_hash').notNull(),
  extractedText: text('extracted_text'), // Raw parsed text
  pageCount: integer('page_count'),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  filingIdx: index('doc_filing_idx').on(table.filingId),
  hashIdx: uniqueIndex('doc_hash_uniq').on(table.documentHash),
}));

export const newsArticles = pgTable('news_articles', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: text('source').notNull(), // 'Moneycontrol', 'Mint'
  title: text('title').notNull(),
  description: text('description'),
  link: text('link').notNull(),
  pubDate: timestamp('pub_date', { withTimezone: true }).notNull(),
  symbols: jsonb('symbols'), // Array of matched symbols
  sectors: jsonb('sectors'), // Array of matched sectors
  category: text('category'), // 'Macro', 'Earnings', 'Global'
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pubDateIdx: index('news_pubdate_idx').on(table.pubDate),
  linkUniq: uniqueIndex('news_link_uniq').on(table.link),
}));

// ──────────────────────────────────────────────
// PARSING & EXTRACTION ENGINE LAYER
// ──────────────────────────────────────────────

export const extractedFinancials = pgTable('extracted_financials', {
  id: uuid('id').defaultRandom().primaryKey(),
  filingId: uuid('filing_id').references(() => corporateFilings.id).notNull(),
  symbol: text('symbol').notNull(),
  period: text('period').notNull(), // e.g. 'Q2 FY25', 'FY24'
  revenue: doublePrecision('revenue'),
  pat: doublePrecision('pat'),
  ebitda: doublePrecision('ebitda'),
  operatingMargin: doublePrecision('operating_margin'),
  yoyGrowth: doublePrecision('yoy_growth'), // Overall revenue growth
  qoqGrowth: doublePrecision('qoq_growth'),
  guidance: text('guidance'), // Raw text extracted for future guidance
  sourceTextSnippet: text('source_text_snippet'), // The paragraph this was extracted from for auditability
  // NOTE: embedding vector(1536) is added via raw SQL migration:
  // ALTER TABLE extracted_financials ADD COLUMN embedding vector(1536);
  // This requires: CREATE EXTENSION IF NOT EXISTS vector;
  extractionConfidence: doublePrecision('extraction_confidence').notNull(),
  extractedAt: timestamp('extracted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('ext_fin_symbol_idx').on(table.symbol),
  filingUniq: uniqueIndex('ext_fin_filing_uniq').on(table.filingId), // 1 extraction per filing for simplicity
}));

export const managementCommentary = pgTable('management_commentary', {
  id: uuid('id').defaultRandom().primaryKey(),
  filingId: uuid('filing_id').references(() => corporateFilings.id).notNull(),
  symbol: text('symbol').notNull(),
  topic: text('topic').notNull(), // 'Demand', 'Capex', 'Risks', 'Margins'
  commentary: text('commentary').notNull(),
  sentimentScore: doublePrecision('sentiment_score'),
  sourceTextSnippet: text('source_text_snippet'), // Exact quote from transcript/filing
  extractedAt: timestamp('extracted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('mc_symbol_idx').on(table.symbol),
  topicIdx: index('mc_topic_idx').on(table.topic),
}));
// ──────────────────────────────────────────────────────────────────────────
// KNOWLEDGE GRAPH & SEMANTIC MEMORY ENGINE LAYER
// Phase 10 — Company Intelligence Graph
// All relationships MUST carry evidence. No hallucinated links.
// ──────────────────────────────────────────────────────────────────────────

/**
 * ENTITIES
 * Canonical deduplicated entity registry.
 * Types: COMPANY | SECTOR | INDUSTRY | PERSON | PRODUCT | TECHNOLOGY
 *        | GEOGRAPHY | COMMODITY | GOVERNMENT_PROGRAM | CAPEX_PROJECT
 */
export const kgEntities = pgTable('kg_entities', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(), // lowercased for dedup
  type: text('type').notNull(), // COMPANY | SECTOR | PERSON | PRODUCT | etc.
  aliases: jsonb('aliases').$type<string[]>().default([]),
  linkedSymbol: text('linked_symbol'), // if type=COMPANY, NSE/BSE symbol
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nameTypeUniq: uniqueIndex('kg_entities_name_type_uniq').on(table.normalizedName, table.type),
  typeIdx: index('kg_entities_type_idx').on(table.type),
  symbolIdx: index('kg_entities_symbol_idx').on(table.linkedSymbol),
}));

/**
 * RELATIONSHIPS
 * Directional graph edges with mandatory evidence.
 * Types: SUPPLIER_OF | CUSTOMER_OF | PEER_OF | SUBSIDIARY_OF | PARENT_OF
 *        | EXPOSED_TO | COMPETES_WITH | COLLABORATES_WITH | JOINT_VENTURE_WITH
 */
export const kgRelationships = pgTable('kg_relationships', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromEntityId: uuid('from_entity_id').references(() => kgEntities.id).notNull(),
  toEntityId: uuid('to_entity_id').references(() => kgEntities.id).notNull(),
  relationshipType: text('relationship_type').notNull(),
  confidenceScore: doublePrecision('confidence_score').notNull(), // 0.0-1.0
  evidenceCount: integer('evidence_count').default(1).notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
}, (table) => ({
  fromEntityIdx: index('kg_rel_from_idx').on(table.fromEntityId),
  toEntityIdx: index('kg_rel_to_idx').on(table.toEntityId),
  typeIdx: index('kg_rel_type_idx').on(table.relationshipType),
  pairUniq: uniqueIndex('kg_rel_pair_uniq').on(table.fromEntityId, table.toEntityId, table.relationshipType),
}));

// ─── Phase 20: AI Audit & Tracing ──────────────────────────────
export const aiAuditLogs = pgTable('ai_audit_logs', {
  id: serial('id').primaryKey(),
  traceId: uuid('trace_id').notNull(),
  correlationId: uuid('correlation_id').notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 50 }).notNull(),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  contextHash: varchar('context_hash', { length: 64 }).notNull(),
  rawContext: jsonb('raw_context').notNull(),
  durationMs: integer('duration_ms').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});


/**
 * RELATIONSHIP EVIDENCE
 * Every relationship MUST have at least one evidence record.
 * This enforces zero-hallucination: no evidence = no relationship.
 */
export const kgRelationshipEvidence = pgTable('kg_relationship_evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  relationshipId: uuid('relationship_id').references(() => kgRelationships.id).notNull(),
  sourceType: text('source_type').notNull(), // FILING | NEWS | COMMENTARY | ANNUAL_REPORT
  sourceId: text('source_id').notNull(), // filing_id, news_id, etc.
  sourceExcerpt: text('source_excerpt').notNull(), // MANDATORY: the exact text that supports this link
  extractedAt: timestamp('extracted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  relIdx: index('kg_evidence_rel_idx').on(table.relationshipId),
  sourceIdx: index('kg_evidence_source_idx').on(table.sourceType, table.sourceId),
}));

/**
 * THEMATIC EXPOSURE
 * Multi-theme classification with confidence scoring.
 * Themes: AI | DEFENSE | RAILWAYS | EV | MANUFACTURING | SEMICONDUCTORS
 *         | LOGISTICS | ENERGY | INFRASTRUCTURE | PLI | CHINA_PLUS_ONE
 *         | DATA_CENTERS | RENEWABLE | PHARMA | AGRI
 */
export const kgThematicExposure = pgTable('kg_thematic_exposure', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  theme: text('theme').notNull(),
  confidenceScore: doublePrecision('confidence_score').notNull(), // 0.0-1.0
  exposureLevel: text('exposure_level').notNull(), // PRIMARY | SECONDARY | PERIPHERAL
  evidenceSummary: text('evidence_summary').notNull(),
  mentionCount: integer('mention_count').default(1).notNull(),
  firstMentionedAt: timestamp('first_mentioned_at', { withTimezone: true }).notNull(),
  lastMentionedAt: timestamp('last_mentioned_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  symbolThemeUniq: uniqueIndex('kg_theme_symbol_theme_uniq').on(table.symbol, table.theme),
  themeIdx: index('kg_theme_theme_idx').on(table.theme),
  symbolIdx: index('kg_theme_symbol_idx').on(table.symbol),
  confidenceIdx: index('kg_theme_confidence_idx').on(table.confidenceScore),
}));

/**
 * MANAGEMENT GUIDANCE MEMORY
 * Tracks historical guidance with execution consistency scores.
 * This powers 'promised vs delivered' intelligence.
 */
export const kgManagementGuidance = pgTable('kg_management_guidance', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  guidanceType: text('guidance_type').notNull(), // REVENUE | MARGIN | CAPEX | VOLUME | EBITDA | CUSTOM
  period: text('period').notNull(), // 'Q2 FY25', 'FY26', etc.
  guidanceText: text('guidance_text').notNull(), // Exact words
  quantifiedValue: doublePrecision('quantified_value'), // Numeric if extractable
  unit: text('unit'), // '%', 'Cr', 'MW', etc.
  sentiment: text('sentiment'), // POSITIVE | NEUTRAL | CAUTIOUS | NEGATIVE
  managementTone: doublePrecision('management_tone'), // -1.0 to 1.0
  sourceType: text('source_type').notNull(), // CONCALL | FILING | PRESENTATION
  sourceId: text('source_id').notNull(),
  sourceExcerpt: text('source_excerpt').notNull(),
  deliveredValue: doublePrecision('delivered_value'), // Filled later if guidance is verifiable
  wasDelivered: boolean('was_delivered'), // null=unknown, true=met, false=missed
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
}, (table) => ({
  symbolIdx: index('kg_guidance_symbol_idx').on(table.symbol),
  periodIdx: index('kg_guidance_period_idx').on(table.period),
  typeIdx: index('kg_guidance_type_idx').on(table.guidanceType),
  deliveredIdx: index('kg_guidance_delivered_idx').on(table.wasDelivered),
}));

/**
 * COMPANY EVENT TIMELINE
 * Chronological intelligence timeline per company.
 * Powers the 'Company Story' feature.
 */
export const kgCompanyTimeline = pgTable('kg_company_timeline', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  eventType: text('event_type').notNull(), // EARNINGS | ACQUISITION | CAPEX_ANNOUNCE | CONCALL
  //                                          | GUIDANCE_UPDATE | SECTOR_EVENT | NEWS | TECHNICAL_BREAKOUT
  //                                          | MANAGEMENT_CHANGE | POLICY_TAILWIND | PARTNERSHIP
  title: text('title').notNull(),
  description: text('description').notNull(),
  significance: text('significance').notNull(), // HIGH | MEDIUM | LOW
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id'),
  sourceUrl: text('source_url'),
  eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('kg_timeline_symbol_idx').on(table.symbol),
  eventDateIdx: index('kg_timeline_date_idx').on(table.eventDate),
  eventTypeIdx: index('kg_timeline_type_idx').on(table.eventType),
  symbolDateIdx: index('kg_timeline_symbol_date_idx').on(table.symbol, table.eventDate),
}));

/**
 * ENTITY MENTIONS
 * Occurrence log: every time an entity appears in a source document.
 * This is the raw input for relationship extraction and confidence scoring.
 */
export const kgEntityMentions = pgTable('kg_entity_mentions', {
  id: uuid('id').defaultRandom().primaryKey(),
  entityId: uuid('entity_id').references(() => kgEntities.id).notNull(),
  contextSymbol: text('context_symbol'), // Which company's document mentioned this entity
  sourceType: text('source_type').notNull(), // FILING | NEWS | COMMENTARY
  sourceId: text('source_id').notNull(),
  mentionExcerpt: text('mention_excerpt').notNull(),
  sentimentInContext: doublePrecision('sentiment_in_context'), // sentiment toward this entity at mention site
  mentionedAt: timestamp('mentioned_at', { withTimezone: true }).notNull(),
}, (table) => ({
  entityIdx: index('kg_mention_entity_idx').on(table.entityId),
  contextSymbolIdx: index('kg_mention_symbol_idx').on(table.contextSymbol),
  sourceIdx: index('kg_mention_source_idx').on(table.sourceType, table.sourceId),
}));

/**
 * GRAPH DIAGNOSTICS
 * Observability for the knowledge graph extraction pipeline.
 */
export const kgDiagnostics = pgTable('kg_diagnostics', {
  id: uuid('id').defaultRandom().primaryKey(),
  runType: text('run_type').notNull(), // ENTITY_EXTRACTION | RELATIONSHIP_EXTRACTION | THEME_CLASSIFICATION
  sourceId: text('source_id').notNull(),
  entitiesExtracted: integer('entities_extracted').default(0).notNull(),
  relationshipsExtracted: integer('relationships_extracted').default(0).notNull(),
  themesClassified: integer('themes_classified').default(0).notNull(),
  guidanceItemsExtracted: integer('guidance_items_extracted').default(0).notNull(),
  processingMs: integer('processing_ms'),
  errorMessage: text('error_message'),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sourceIdx: index('kg_diag_source_idx').on(table.sourceId),
  runTypeIdx: index('kg_diag_type_idx').on(table.runType),
}));

// ──────────────────────────────────────────────────────────────────────────
// MARKET REGIME & CROSS-MARKET CONTEXT ENGINE LAYER
// Phase 11 — Institutional-Grade Market Context
// ──────────────────────────────────────────────────────────────────────────

/**
 * MARKET REGIMES
 * Tracks overarching market environment with probabilistic scoring.
 */
export const marketRegimes = pgTable('market_regimes', {
  id: uuid('id').defaultRandom().primaryKey(),
  regimeType: text('regime_type').notNull(), // RISK_ON | RISK_OFF | ACCUMULATION | DISTRIBUTION | MOMENTUM_EXPANSION | MEAN_REVERSION | HIGH_VOLATILITY | LOW_VOLATILITY | LIQUIDITY_EXPANSION | LIQUIDITY_CONTRACTION
  confidenceScore: doublePrecision('confidence_score').notNull(), // 0.0 - 1.0
  primaryFactors: jsonb('primary_factors').$type<string[]>().notNull(), // Array of factors driving this regime
  durationDays: integer('duration_days').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  assessedAt: timestamp('assessed_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
}, (table) => ({
  regimeTypeIdx: index('mr_type_idx').on(table.regimeType),
  activeIdx: index('mr_active_idx').on(table.isActive),
  assessedIdx: index('mr_assessed_idx').on(table.assessedAt),
}));

/**
 * BREADTH INTELLIGENCE
 * Tracks market participation metrics.
 */
export const breadthIntelligence = pgTable('breadth_intelligence', {
  id: uuid('id').defaultRandom().primaryKey(),
  indexSymbol: text('index_symbol').notNull(), // e.g., 'NIFTY_500'
  advances: integer('advances').notNull(),
  declines: integer('declines').notNull(),
  unchanged: integer('unchanged').notNull(),
  newHighs52w: integer('new_highs_52w').notNull(),
  newLows52w: integer('new_lows_52w').notNull(),
  above20dma: doublePrecision('above_20dma').notNull(), // percentage
  above50dma: doublePrecision('above_50dma').notNull(), // percentage
  above200dma: doublePrecision('above_200dma').notNull(), // percentage
  breadthThrustSignal: boolean('breadth_thrust_signal').default(false).notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  indexIdx: index('bi_index_idx').on(table.indexSymbol),
  calcAtIdx: index('bi_calc_idx').on(table.calculatedAt),
}));

/**
 * SECTOR ROTATION
 * Dynamic sector rotation tracking.
 */
export const sectorRotation = pgTable('sector_rotation', {
  id: uuid('id').defaultRandom().primaryKey(),
  sectorName: text('sector_name').notNull(),
  momentumScore: doublePrecision('momentum_score').notNull(), // Normalized -1.0 to 1.0
  relativeStrengthVsIndex: doublePrecision('relative_strength_vs_index').notNull(),
  participationBreadth: doublePrecision('participation_breadth').notNull(), // Percentage of stocks participating
  rotationalVelocity: doublePrecision('rotational_velocity').notNull(), // Rate of change in momentum
  status: text('status').notNull(), // LEADING | WEAKENING | LAGGING | IMPROVING
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sectorIdx: index('sr_sector_idx').on(table.sectorName),
  statusIdx: index('sr_status_idx').on(table.status),
  calcAtIdx: index('sr_calc_idx').on(table.calculatedAt),
}));

/**
 * LIQUIDITY FLOWS
 * Tracking volume and capital movement.
 */
export const liquidityFlows = pgTable('liquidity_flows', {
  id: uuid('id').defaultRandom().primaryKey(),
  targetType: text('target_type').notNull(), // INDEX | SECTOR | THEME | SYMBOL
  targetIdentifier: text('target_identifier').notNull(), // NSE_SYMBOL or Sector Name
  turnoverExpansionRatio: doublePrecision('turnover_expansion_ratio').notNull(), // Today's turnover vs 20d avg
  deliveryVolumeSurge: doublePrecision('delivery_volume_surge'), // Nullable if data not available
  institutionalAccumulationScore: doublePrecision('institutional_accumulation_score').notNull(), // 0.0 - 1.0 based on block deals/delivery
  blockDealVolume: doublePrecision('block_deal_volume'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  targetIdx: index('lf_target_idx').on(table.targetType, table.targetIdentifier),
  detectedIdx: index('lf_detected_idx').on(table.detectedAt),
}));

/**
 * LEADERSHIP RANKINGS
 * Identifies true market leaders and stealth accumulation.
 */
export const leadershipRankings = pgTable('leadership_rankings', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: text('symbol').notNull(),
  leadershipScore: doublePrecision('leadership_score').notNull(), // 0.0 - 100.0
  category: text('category').notNull(), // TRUE_LEADER | STEALTH_ACCUMULATION | WEAKENING_LEADER | EMERGING_MOMENTUM | SECTOR_GENERAL
  persistenceDays: integer('persistence_days').default(1).notNull(),
  institutionalQualityScore: doublePrecision('institutional_quality_score').notNull(), // Derived from fundamentals + liquidity
  rankedAt: timestamp('ranked_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('lr_symbol_idx').on(table.symbol),
  categoryIdx: index('lr_category_idx').on(table.category),
  rankedIdx: index('lr_ranked_idx').on(table.rankedAt),
}));

/**
 * VOLATILITY REGIMES
 * Volatility and participation analysis.
 */
export const volatilityRegimes = pgTable('volatility_regimes', {
  id: uuid('id').defaultRandom().primaryKey(),
  targetType: text('target_type').notNull(), // INDEX | SECTOR | SYMBOL
  targetIdentifier: text('target_identifier').notNull(),
  atrExpansionRatio: doublePrecision('atr_expansion_ratio').notNull(), // Current ATR vs historical ATR
  realizedVolatility: doublePrecision('realized_volatility').notNull(), // e.g. 20-day historical vol
  impliedVolatilityProxy: doublePrecision('implied_volatility_proxy'), // e.g. India VIX if applicable
  rallyQuality: text('rally_quality'), // NARROW | BROAD | CHOPPY
  assessedAt: timestamp('assessed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  targetIdx: index('vr_target_idx').on(table.targetType, table.targetIdentifier),
  assessedIdx: index('vr_assessed_idx').on(table.assessedAt),
}));

/**
 * THEMATIC MOMENTUM
 * Thematic momentum tracking.
 */
export const thematicMomentum = pgTable('thematic_momentum', {
  id: uuid('id').defaultRandom().primaryKey(),
  theme: text('theme').notNull(),
  momentumScore: doublePrecision('momentum_score').notNull(),
  participationBreadth: doublePrecision('participation_breadth').notNull(), // % of stocks in theme moving up
  capitalFlowProxy: doublePrecision('capital_flow_proxy').notNull(), // Aggregate turnover expansion
  acceleration: doublePrecision('acceleration').notNull(), // Rate of change of momentum
  status: text('status').notNull(), // ACCELERATING | DECELERATING | STEADY
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  themeIdx: index('tm_theme_idx').on(table.theme),
  statusIdx: index('tm_status_idx').on(table.status),
  calcIdx: index('tm_calc_idx').on(table.calculatedAt),
}));

/**
 * MARKET MEMORY
 * Historical regime changes and significant market events.
 */
export const marketMemory = pgTable('market_memory', {
  id: uuid('id').defaultRandom().primaryKey(),
  memoryType: text('memory_type').notNull(), // REGIME_CHANGE | BREADTH_COLLAPSE | LEADERSHIP_CYCLE | ACCUMULATION_PHASE | DISTRIBUTION_PHASE
  title: text('title').notNull(),
  description: text('description').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  typeIdx: index('mm_type_idx').on(table.memoryType),
  startIdx: index('mm_start_idx').on(table.startDate),
}));

// ──────────────────────────────────────────────────────────────────────────
// SEMANTIC FINANCIAL INTELLIGENCE & VECTOR SEARCH
// Phase 12 — Institutional-Grade Contextual AI Retrieval
// ──────────────────────────────────────────────────────────────────────────

/**
 * SEMANTIC DOCUMENTS
 * Logical grouping of chunks (e.g. one earnings transcript).
 */
export const semanticDocuments = pgTable('semantic_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceType: text('source_type').notNull(), // FILING | NEWS | AI_NARRATIVE | MARKET_CONTEXT
  sourceId: text('source_id').notNull(), // Link to filing_documents.id or news.id
  symbol: text('symbol').notNull(),
  title: text('title').notNull(),
  documentDate: timestamp('document_date', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sourceIdx: index('sd_source_idx').on(table.sourceType, table.sourceId),
  symbolIdx: index('sd_symbol_idx').on(table.symbol),
}));

/**
 * SEMANTIC CHUNKS
 * Chunk-level embeddings.
 */
export const semanticChunks = pgTable('semantic_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => semanticDocuments.id, { onDelete: 'cascade' }).notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  chunkType: text('chunk_type').notNull(), // MANAGEMENT_DISCUSSION | RISK_FACTOR | CAPEX | HIGHLIGHTS | THEMATIC
  text: text('text').notNull(),
  tokenCount: integer('token_count').notNull(),
  
  // NOTE: embedding vector(1536) is added via raw SQL migration:
  // ALTER TABLE semantic_chunks ADD COLUMN embedding vector(1536);
  // CREATE INDEX ON semantic_chunks USING ivfflat (embedding vector_cosine_ops);
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  docIdx: index('sc_doc_idx').on(table.documentId),
  typeIdx: index('sc_type_idx').on(table.chunkType),
}));

/**
 * RETRIEVAL LOGS
 * Observability and quality tracking for semantic queries.
 */
export const retrievalLogs = pgTable('retrieval_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  queryText: text('query_text').notNull(),
  queryVectorLength: integer('query_vector_length').notNull(), // Should be 1536
  resultCount: integer('result_count').notNull(),
  maxSimilarityScore: doublePrecision('max_similarity_score'),
  executionTimeMs: integer('execution_time_ms').notNull(),
  filtersApplied: jsonb('filters_applied').$type<Record<string, unknown>>().default({}),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  timeIdx: index('rl_time_idx').on(table.timestamp),
}));

// ──────────────────────────────────────────────────────────────────────────
// PORTFOLIO WATCHLIST INTELLIGENCE
// Phase 14 — Intelligent Watchlists
// ──────────────────────────────────────────────────────────────────────────

export const watchlists = pgTable('watchlists', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  symbols: jsonb('symbols').$type<string[]>().default([]).notNull(),
  themeExposure: jsonb('theme_exposure').$type<Record<string, number>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const watchlistEvents = pgTable('watchlist_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  watchlistId: uuid('watchlist_id').references(() => watchlists.id, { onDelete: 'cascade' }).notNull(),
  symbol: text('symbol').notNull(),
  eventType: text('event_type').notNull(), // EARNINGS | SIGNAL | MANAGEMENT_CHANGE | THEMATIC_SHIFT
  eventTitle: text('event_title').notNull(),
  impactScore: doublePrecision('impact_score').notNull(),
  eventDate: timestamp('event_date', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  wlIdx: index('we_wl_idx').on(table.watchlistId),
}));

export const watchlistAlerts = pgTable('watchlist_alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  watchlistId: uuid('watchlist_id').references(() => watchlists.id, { onDelete: 'cascade' }).notNull(),
  alertType: text('alert_type').notNull(), // RISK_CONCENTRATION | SECTOR_OVERLAP
  message: text('message').notNull(),
  resolved: boolean('resolved').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ──────────────────────────────────────────────────────────────────────────
// COPILOT MEMORY & CONVERSATION LAYER
// Phase 14 — Institutional Copilot
// ──────────────────────────────────────────────────────────────────────────

export const copilotSessions = pgTable('copilot_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  summary: text('summary'),
  watchlistId: uuid('watchlist_id').references(() => watchlists.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const copilotMessages = pgTable('copilot_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').references(() => copilotSessions.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull(), // user | assistant | system
  content: text('content').notNull(),
  intent: text('intent'),
  confidenceScore: doublePrecision('confidence_score'),
  citations: jsonb('citations').$type<any[]>().default([]),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionIdx: index('cm_session_idx').on(table.sessionId),
  timeIdx: index('cm_time_idx').on(table.timestamp),
}));

export const copilotContextSnapshots = pgTable('copilot_context_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').references(() => copilotMessages.id, { onDelete: 'cascade' }).notNull(),
  marketRegime: text('market_regime'),
  injectedEvidence: jsonb('injected_evidence').$type<any[]>().default([]),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});

// ──────────────────────────────────────────────────────────────────────────
// PORTFOLIO INTELLIGENCE ENGINE
// Phase 15 — Autonomous Watchlist & Portfolio
// ──────────────────────────────────────────────────────────────────────────

export const portfolios = pgTable('portfolios', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  benchmark: text('benchmark').default('NIFTY_50'),
  cashBalance: doublePrecision('cash_balance').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const portfolioHoldings = pgTable('portfolio_holdings', {
  id: uuid('id').defaultRandom().primaryKey(),
  portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
  symbol: text('symbol').notNull(),
  quantity: integer('quantity').notNull(),
  averagePrice: doublePrecision('average_price').notNull(),
  currency: text('currency').default('INR'),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  portIdx: index('ph_port_idx').on(table.portfolioId),
}));

// ──────────────────────────────────────────────────────────────────────────
// AUTHENTICATION & MULTI-TENANT INFRASTRUCTURE
// Phase 16 — Production Security
// ──────────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').default('user').notNull(), // user | analyst | admin
  isActive: boolean('is_active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
}));

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('us_user_idx').on(table.userId),
  tokenIdx: uniqueIndex('us_token_idx').on(table.token),
}));

export const userSettings = pgTable('user_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  theme: text('theme').default('dark'),
  defaultBenchmark: text('default_benchmark').default('NIFTY_50'),
  aiProviderPreference: text('ai_provider_preference').default('LOCAL_FIRST'),
  notificationsEnabled: boolean('notifications_enabled').default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex('uset_user_idx').on(table.userId),
}));

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  keyHash: text('key_hash').notNull(),
  label: text('label').notNull(),
  permissions: jsonb('permissions').$type<string[]>().default(['read']),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('ak_user_idx').on(table.userId),
  keyIdx: uniqueIndex('ak_key_idx').on(table.keyHash),
}));

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // LOGIN | LOGOUT | API_CALL | SETTINGS_CHANGE | AI_QUERY
  resource: text('resource'),
  details: jsonb('details').$type<Record<string, unknown>>().default({}),
  ipAddress: text('ip_address'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('al_user_idx').on(table.userId),
  timeIdx: index('al_time_idx').on(table.timestamp),
  actionIdx: index('al_action_idx').on(table.action),
}));

// ──────────────────────────────────────────────────────────────────────────
// PRODUCTIZATION: SAAS, BILLING & ORGANIZATIONS
// Phase 17 — Monetization Foundations
// ──────────────────────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  plan: text('plan').default('free').notNull(), // free | pro | institutional
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').default('member').notNull(), // admin | member
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('om_org_idx').on(table.organizationId),
  userIdx: index('om_user_idx').on(table.userId),
}));

export const userUsage = pgTable('user_usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  monthPeriod: text('month_period').notNull(), // e.g. "2024-05"
  aiTokensUsed: integer('ai_tokens_used').default(0).notNull(),
  queriesMade: integer('queries_made').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userMonthIdx: uniqueIndex('usage_user_month_idx').on(table.userId, table.monthPeriod),
}));

export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  flagKey: text('flag_key').notNull(),
  isEnabled: boolean('is_enabled').default(false).notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  keyIdx: uniqueIndex('ff_key_idx').on(table.flagKey),
}));

// ─── Phase 21: Autonomous Runtime & Governance ─────────────────

export const workerHealthLogs = pgTable('worker_health_logs', {
  id: serial('id').primaryKey(),
  workerName: varchar('worker_name', { length: 100 }).notNull(),
  state: varchar('state', { length: 20 }).notNull(), // STARTING, HEALTHY, DEGRADED, RESTARTING, FAILED
  hostname: varchar('hostname', { length: 100 }).notNull(),
  pid: integer('pid').notNull(),
  memoryUsageMB: integer('memory_usage_mb'),
  cpuUsagePct: integer('cpu_usage_pct'),
  heartbeatAt: timestamp('heartbeat_at').notNull().defaultNow(),
  errorCount: integer('error_count').default(0),
  lastError: text('last_error'),
});

export const recoveryIncidents = pgTable('recovery_incidents', {
  id: serial('id').primaryKey(),
  component: varchar('component', { length: 100 }).notNull(), // Redis, Postgres, Ollama, etc.
  incidentType: varchar('incident_type', { length: 100 }).notNull(),
  description: text('description').notNull(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
  stepsTaken: jsonb('steps_taken').default([]), // List of healing steps
  outcome: varchar('outcome', { length: 50 }), // SUCCESS, PARTIAL, FAILED
});

export const aiGovernanceLogs = pgTable('ai_governance_logs', {
  id: serial('id').primaryKey(),
  traceId: uuid('trace_id').notNull(),
  violationType: varchar('violation_type', { length: 100 }).notNull(), // HALLUCINATION, SPECULATION, NUMERIC_UNSUPPORTED
  severity: varchar('severity', { length: 20 }).notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  detail: text('detail').notNull(),
  score: doublePrecision('score').notNull(), // 0.0 - 1.0 (lower is worse)
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 50 }).notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

export const aiTokenUsage = pgTable('ai_token_usage', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id'),
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 50 }).notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costEstimate: doublePrecision('cost_estimate').notNull().default(0.0),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

export const vectorCompactionLogs = pgTable('vector_compaction_logs', {
  id: serial('id').primaryKey(),
  compactionType: varchar('type', { length: 50 }).notNull(), // MERGE, COMPRESS, ARCHIVE
  chunksProcessed: integer('chunks_processed').notNull(),
  storageSavedMB: doublePrecision('storage_saved_mb').notNull(),
  durationMs: integer('duration_ms').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

