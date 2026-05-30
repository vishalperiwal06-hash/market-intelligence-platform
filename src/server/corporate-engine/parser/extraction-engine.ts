import { aiClient } from '../../ai-engine/deepseek';
import { logger } from '../../../lib/logger';
import { db } from '../../../lib/db';
import { extractedFinancials, managementCommentary } from '../../../lib/db/schema';

export class ExtractionEngine {
  
  /**
   * Prompts DeepSeek to extract structured financials.
   * STRICT ZERO-FABRICATION INSTRUCTIONS.
   */
  async extractFinancials(filingId: string, symbol: string, rawText: string) {
    logger.info('ExtractionEngine', `Extracting financials for ${symbol}`);
    
    // We truncate text to 20k chars to avoid token limits for this MVP.
    const contextText = rawText.substring(0, 20000);
    
    const prompt = `
You are an institutional financial auditor.
Extract the following key metrics from the provided text.

RULES:
1. ONLY extract values that are explicitly stated in the text.
2. If a value is NOT FOUND, return null.
3. DO NOT calculate, infer, or guess missing values.
4. Normalize all numbers to pure floats (in Crores INR). If the text says "150.5 Cr", output 150.5.
5. Return ONLY a valid JSON object. No markdown formatting.

EXPECTED JSON FORMAT:
{
  "period": "e.g. Q1 FY25",
  "revenue": number | null,
  "pat": number | null,
  "ebitda": number | null,
  "operatingMargin": number | null,
  "yoyGrowth": number | null, // percentage
  "qoqGrowth": number | null, // percentage
  "guidance": "string | null",
  "sourceTextSnippet": "exact sentence where revenue was found"
}

TEXT:
${contextText}
`;

    try {
      const response = await aiClient.generate(prompt, 'You are an institutional financial auditor. Return strict JSON only.');
      
      // Clean JSON string (in case DeepSeek wraps in ```json)
      let cleanContent = response.content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.substring(7, cleanContent.length - 3).trim();
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.substring(3, cleanContent.length - 3).trim();
      }

      const extracted = JSON.parse(cleanContent);
      
      // We assign a baseline confidence. If values are null, it's lower.
      const confidence = extracted.revenue && extracted.pat ? 0.95 : 0.60;

      const record = {
        filingId,
        symbol,
        period: extracted.period || 'Unknown',
        revenue: extracted.revenue || null,
        pat: extracted.pat || null,
        ebitda: extracted.ebitda || null,
        operatingMargin: extracted.operatingMargin || null,
        yoyGrowth: extracted.yoyGrowth || null,
        qoqGrowth: extracted.qoqGrowth || null,
        guidance: extracted.guidance || null,
        sourceTextSnippet: extracted.sourceTextSnippet || null,
        extractionConfidence: confidence
      };

      const [inserted] = await db.insert(extractedFinancials).values(record).onConflictDoNothing().returning();
      
      if (inserted) {
        logger.info('ExtractionEngine', `Successfully extracted financials for ${symbol}`);
      }
      return inserted;
    } catch (error) {
      logger.error('ExtractionEngine', `Financial extraction failed for ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Prompts DeepSeek to extract Management Commentary topics.
   */
  async extractCommentary(filingId: string, symbol: string, rawText: string) {
    logger.info('ExtractionEngine', `Extracting commentary for ${symbol}`);
    
    const contextText = rawText.substring(0, 20000);
    
    const prompt = `
You are an institutional financial auditor.
Extract management commentary by topic from the text.

RULES:
1. ONLY extract explicitly stated commentary.
2. Return a JSON array of objects.
3. Valid topics: 'Demand', 'Capex', 'Risks', 'Margins', 'Guidance'.
4. Return ONLY valid JSON array.

EXPECTED FORMAT:
[
  {
    "topic": "Demand",
    "commentary": "Summary of management statement...",
    "sentimentScore": 0.5, // -1.0 to 1.0
    "sourceTextSnippet": "Exact quote from text"
  }
]

TEXT:
${contextText}
`;

    try {
      const response = await aiClient.generate(prompt, 'You are an institutional financial auditor. Return strict JSON only.');
      
      let cleanContent = response.content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.substring(7, cleanContent.length - 3).trim();
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.substring(3, cleanContent.length - 3).trim();
      }

      const extractedItems: any[] = JSON.parse(cleanContent);
      
      for (const item of extractedItems) {
        await db.insert(managementCommentary).values({
          filingId,
          symbol,
          topic: item.topic,
          commentary: item.commentary,
          sentimentScore: item.sentimentScore || 0,
          sourceTextSnippet: item.sourceTextSnippet || null,
        });
      }

      logger.info('ExtractionEngine', `Extracted ${extractedItems.length} commentary blocks for ${symbol}`);
      return extractedItems;
    } catch (error) {
      logger.error('ExtractionEngine', `Commentary extraction failed for ${symbol}`, error);
      throw error;
    }
  }
}

export const extractionEngine = new ExtractionEngine();
