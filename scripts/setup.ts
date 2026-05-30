/**
 * AI Bazaar — Local Dev Bootstrap & Diagnostics
 * Phase 17 — Developer Experience
 */
import 'dotenv/config';
import { redis } from '../src/lib/redis';
import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';
import { execSync } from 'child_process';

const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'AUTH_SECRET'];

async function runDiagnostics() {
  console.log('\n🔍 Running AI Bazaar Diagnostics...\n');

  // 1. Env check
  let envOk = true;
  for (const v of requiredEnvVars) {
    if (!process.env[v]) {
      console.log(`❌ Missing environment variable: ${v}`);
      envOk = false;
    } else {
      console.log(`✅ Found ${v}`);
    }
  }
  if (!envOk) {
    console.log('\n❌ Environment check failed. Please copy production.env.example to .env and fill it.');
    process.exit(1);
  }

  // 2. Redis check
  try {
    const ping = await redis.ping();
    if (ping === 'PONG') {
      console.log('✅ Redis connected');
    } else {
      throw new Error('Invalid ping response');
    }
  } catch (e: any) {
    console.log('❌ Redis connection failed:', e.message);
    process.exit(1);
  }

  // 3. DB & pgvector check
  try {
    const res = await db.execute(sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`);
    if (res.length > 0) {
      console.log('✅ PostgreSQL connected & pgvector enabled');
    } else {
      console.log('❌ PostgreSQL connected, but pgvector extension is MISSING.');
      console.log('Run: psql -d aibazaar -c "CREATE EXTENSION vector;"');
      process.exit(1);
    }
  } catch (e: any) {
    console.log('❌ PostgreSQL connection failed:', e.message);
    process.exit(1);
  }

  // 4. Ollama check
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const res = await fetch(ollamaUrl);
    if (res.ok) {
      console.log('✅ Ollama local inference running');
    }
  } catch (e) {
    console.log('⚠️  Ollama is not responding. Local AI features will fail.');
    console.log('    Ensure Ollama is running, or set cloud API keys in .env.');
  }

  console.log('\n🚀 Diagnostics passed. Starting migrations...');
  
  try {
    execSync('npx drizzle-kit push', { stdio: 'inherit' });
    console.log('\n✅ DB Migrations Complete.');
  } catch (e) {
    console.log('\n❌ DB Migrations Failed.');
    process.exit(1);
  }

  console.log('\n🎉 System is ready! Run `npm run dev` to start.\n');
  process.exit(0);
}

runDiagnostics();
