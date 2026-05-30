import postgres from 'postgres';

async function main() {
  const sql = postgres('postgresql://aibazaar:changeme_in_production@127.0.0.1:5432/aibazaar');
  
  const bucketStart = new Date('2026-05-22T11:20:00.000Z');
  const bucketEnd = new Date('2026-05-22T11:21:00.000Z');

  try {
    console.log('Running query...');
    const result = await sql`
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
    `;
    console.log('Query succeeded!', result);
  } catch (err: any) {
    console.error('Query failed!');
    console.error('Error properties:', Object.keys(err));
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error detail:', err.detail);
    console.error('Error stack:', err.stack);
  } finally {
    await sql.end();
  }
}

main();
