/**
 * PDF Acquisition Engine
 * 
 * Securely downloads PDFs from NSE/BSE.
 * Hashes them for duplicate detection and sends them to the parser.
 */
import { db } from '../../../lib/db';
import { filingDocuments } from '../../../lib/db/schema';
import { logger } from '../../../lib/logger';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { enqueueDocumentParsing } from '../queues/parsing-producer';

export class PdfAcquisitionEngine {
  
  // Local storage for now; production would use S3
  private storagePath = path.join(process.cwd(), 'storage', 'filings');

  constructor() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async acquire(filingId: string, symbol: string, pdfUrl: string, filingCategory: string = 'General Announcement') {
    logger.info('PdfAcquisition', `Starting download for ${symbol} filing ${filingId} from ${pdfUrl}`);

    try {
      // 1. Download
      const response = await fetch(pdfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/pdf'
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const buffer = await response.arrayBuffer();
      const nodeBuffer = Buffer.from(buffer);

      // 2. Hash Document (detect duplicates, e.g. same PDF uploaded twice)
      const hash = crypto.createHash('sha256').update(nodeBuffer).digest('hex');

      // 3. Save to disk/S3
      const filename = `${filingId}_${hash.substring(0, 8)}.pdf`;
      const filePath = path.join(this.storagePath, filename);
      fs.writeFileSync(filePath, nodeBuffer);

      // 4. Record Metadata in DB
      try {
        await db.insert(filingDocuments).values({
          filingId,
          s3Key: filePath, // Using local path here
          documentHash: hash,
        }).onConflictDoNothing();
        
        logger.info('PdfAcquisition', `Saved PDF to ${filePath}`);
        
        // Trigger async Parsing Pipeline via BullMQ
        await enqueueDocumentParsing(filingId, symbol, filePath, filingCategory);
        
      } catch (dbErr) {
         logger.warn('PdfAcquisition', `Duplicate PDF hash detected: ${hash}`);
      }

    } catch (error) {
      logger.error('PdfAcquisition', `Failed to download PDF for ${filingId}`, error);
    }
  }
}

export const pdfAcquisitionEngine = new PdfAcquisitionEngine();
