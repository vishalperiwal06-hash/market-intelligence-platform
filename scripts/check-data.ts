import 'dotenv/config';
import { db } from '../src/lib/db';
import { corporateFilings, managementCommentary, extractedFinancials } from '../src/lib/db/schema';
import { desc } from 'drizzle-orm';

async function main() {
  console.log('--- Inspecting Database Filings ---');
  try {
    const filingsCount = await db.select().from(corporateFilings);
    console.log(`Total corporate filings in DB: ${filingsCount.length}`);
    
    if (filingsCount.length > 0) {
      console.log('First 5 corporate filings:');
      filingsCount.slice(0, 5).forEach((f, idx) => {
        console.log(`[${idx+1}] Symbol: ${f.symbol}, Category: ${f.category}`);
        console.log(`    Subject: ${f.subject}`);
        console.log(`    PDF URL: ${f.pdfUrl}`);
        console.log(`    Date: ${f.broadcastDate}`);
      });
    }

    const commentariesCount = await db.select().from(managementCommentary);
    console.log(`\nTotal commentaries in DB: ${commentariesCount.length}`);

    const financialsCount = await db.select().from(extractedFinancials);
    console.log(`\nTotal financials in DB: ${financialsCount.length}`);
  } catch (err: any) {
    console.error('Error querying database:', err);
    if (err.stack) console.error(err.stack);
  }
  process.exit(0);
}

main();
