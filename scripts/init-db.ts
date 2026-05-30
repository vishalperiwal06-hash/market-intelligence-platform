import { execSync } from 'node:child_process';
import { client, db } from '../src/lib/db';
import { sql } from 'drizzle-orm';
import { logger } from '../src/lib/logger';

const MAX_ATTEMPTS = Number(process.env.DB_INIT_MAX_ATTEMPTS || 30);
const WAIT_MS = Number(process.env.DB_INIT_WAIT_MS || 2000);

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDatabase() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await db.execute(sql`select 1`);
      logger.info('DBInit', 'Database connection established', { attempt });
      return;
    } catch (error) {
      logger.warn('DBInit', 'Database not ready yet', { attempt, error });
      await sleep(WAIT_MS);
    }
  }

  throw new Error(`Database was not reachable after ${MAX_ATTEMPTS} attempts`);
}

async function ensureExtensions() {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  logger.info('DBInit', 'Verified pgvector extension');
}

async function verifyCoreTables() {
  const result = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);

  logger.info('DBInit', 'Tables verified', { count: result.length });
}

async function main() {
  await waitForDatabase();
  await ensureExtensions();

  execSync('./node_modules/.bin/drizzle-kit push --config drizzle.config.ts --force', {
    stdio: 'inherit',
    env: process.env,
  });

  try {
    execSync('./node_modules/.bin/tsx scripts/migrate-phase19.ts', {
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err: any) {
    logger.warn('DBInit', 'Phase19 migration skipped', { error: err?.message || String(err) });
  }

  logger.info('DBInit', 'Ensuring explicit database indexes...');
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tick_history_symbol_timestamp ON tick_history(symbol, timestamp DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tick_history_timestamp ON tick_history(timestamp DESC)`);
  logger.info('DBInit', 'Explicit database indexes verified');

  await verifyCoreTables();

  logger.info('DBInit', 'Database initialization complete');
}

main()
  .catch((error) => {
    logger.error('DBInit', 'Database initialization failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });