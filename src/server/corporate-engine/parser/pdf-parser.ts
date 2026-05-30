import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { logger } from '../../../lib/logger';

export class PdfParser {
  /**
   * Extracts raw text from a PDF file on disk.
   */
  async extractText(filePath: string): Promise<{ text: string, pages: number }> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      // PDFParse constructor accepts { data: Buffer } for in-memory parsing
      const parser = new PDFParse({ data: dataBuffer }) as any;
      const text: string = await parser.getText() || '';
      let pages = 0;
      try {
        const info = await parser.getInfo();
        pages = info?.numPages || 0;
      } catch {
        // Some PDFs don't expose info; default to 0
      }

      return { text, pages };
    } catch (error) {
      logger.error('PdfParser', `Failed to parse PDF at ${filePath}`, error);
      throw error;
    }
  }

  /**
   * Basic table extraction heuristic.
   * Extracts blocks of text that look like tabular data (multiple numbers per line).
   */
  extractTables(text: string): string[] {
    const lines = text.split('\n');
    const tables: string[] = [];
    let currentTable: string[] = [];
    
    let isTableRegion = false;

    for (const line of lines) {
      const numberCount = (line.match(/\d+[\.,]?\d*/g) || []).length;
      
      if (numberCount >= 3) {
        if (!isTableRegion) {
          isTableRegion = true;
          currentTable = [];
        }
        currentTable.push(line);
      } else {
        if (isTableRegion && line.trim().length === 0) {
          tables.push(currentTable.join('\n'));
          isTableRegion = false;
        } else if (isTableRegion) {
           currentTable.push(line);
        }
      }
    }

    if (isTableRegion) {
      tables.push(currentTable.join('\n'));
    }

    return tables;
  }
}

export const pdfParser = new PdfParser();
