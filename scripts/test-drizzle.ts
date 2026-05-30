import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  const bucketStart = new Date('2026-05-22T11:20:00.000Z');
  const bucketEnd = new Date('2026-05-22T11:21:00.000Z');

  try {
    console.log('Running Drizzle query...');
    const result = await db.execute(sql`
      WITH ordered_ticks AS (
        SELECT
          symbol,
          price,
          volume,
          turnover,
          timestamp,
          ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY timestamp ASC) as rn_asc,
          ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn_desc
        FROM tick_history
        WHERE timestamp >= ${bucketStart.toISOString()}::timestamptz
          AND timestamp < ${bucketEnd.toISOString()}::timestamptz
      )
      SELECT
        symbol,
        MAX(CASE WHEN rn_asc = 1 THEN price END) as open,
        MAX(price) as high,
        MIN(price) as low,
        MAX(CASE WHEN rn_desc = 1 THEN price END) as close,
        COALESCE(MAX(volume), 0) as volume,
        COALESCE(SUM(turnover), 0) as turnover,
        COUNT(*) as tick_count
      FROM ordered_ticks
      GROUP BY symbol
      HAVING COUNT(*) > 0
    `);
    console.log('Drizzle query succeeded!', result);
  } catch (err: any) {
    console.error('Drizzle query failed!');
    console.error('Error properties:', Object.keys(err));
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
  } finally {
    process.exit(0);
  }
}

main();
