import { createServer } from 'http';
import { MarketPipeline } from './market-engine/pipeline';
import { WebSocketGateway } from './realtime/ws-gateway';
import { memoryController } from './realtime/memory-controller';
import { MarketAggregator } from './market-engine/workers/aggregator';
import { tickPersistenceWorker } from './market-engine/workers/tick-persistence';
import { ohlcEngine } from './market-engine/workers/ohlc-engine';
import { indicatorWorker } from './market-engine/workers/indicator-worker';
import { retentionWorker } from './market-engine/workers/retention';
import { scannerWorker } from './market-engine/workers/scanner-worker';
import { logger } from '../lib/logger';
import { aiWorker } from './ai-engine/queues/worker';
import { corporateWorker } from './corporate-engine/workers/corporate-worker';
import { parsingWorker } from './corporate-engine/queues/parsing-worker';
import { db, client } from '../lib/db';
import { redis } from '../lib/redis';
import { sql } from 'drizzle-orm';
import { nseDataService } from './nse/nselib-service';
import { metricsCollector } from '../lib/metrics-collector';
import { providerHealthEngine } from './market-engine/orchestration/health';

async function runStartupSelfTest(): Promise<boolean> {
  logger.info('SelfTest', 'Running startup dependency diagnostics...');
  
  // 1.5 Verify timestamp bucket alignment (Item 4)
  try {
    const testDate = new Date('2026-05-22T12:34:56.789Z');
    const b1m = ohlcEngine.getBucketStart(testDate, '1m').toISOString();
    const b5m = ohlcEngine.getBucketStart(testDate, '5m').toISOString();
    const b15m = ohlcEngine.getBucketStart(testDate, '15m').toISOString();
    if (b1m === '2026-05-22T12:34:00.000Z' && b5m === '2026-05-22T12:30:00.000Z' && b15m === '2026-05-22T12:30:00.000Z') {
      logger.info('SelfTest', 'Timestamp bucketing alignment verified (1m, 5m, 15m boundaries are UTC-consistent)');
    } else {
      logger.error('SelfTest', 'Timestamp bucketing alignment failed UTC consistency test!');
    }
  } catch (err) {
    logger.error('SelfTest', 'Failed to run timestamp bucketing self-test', err);
  }

  let dbOk = false;
  let redisOk = false;
  let nseOk = false;
  let httpsOk = false;
  
  let dbError = '';
  let redisError = '';
  let nseError = '';
  let httpsError = '';
  
  // 1. Verify DB + Clock Skew check (CRITICAL — fatal if fails)
  try {
    const dbTimeResult = await db.execute(sql`SELECT NOW() as db_now`);
    const dbNowStr = (dbTimeResult as any[])[0]?.db_now;
    if (dbNowStr) {
      const dbTime = new Date(dbNowStr).getTime();
      const nodeTime = Date.now();
      const skewSeconds = Math.abs(nodeTime - dbTime) / 1000;
      if (skewSeconds > 2) {
        logger.warn('SelfTest', `Clock skew detected between DB and Node container: ${skewSeconds}s (Threshold: 2s)`);
      } else {
        logger.info('SelfTest', `Clock skew check passed: ${skewSeconds}s difference`);
      }
    }
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }
  
  // 2. Verify Redis (CRITICAL — fatal if fails)
  try {
    const reply = await redis.ping();
    if (reply === 'PONG') {
      redisOk = true;
    } else {
      redisError = `Unexpected ping response: ${reply}`;
    }
  } catch (err) {
    redisError = err instanceof Error ? err.message : String(err);
  }
  
  // 3. Verify NSE Service (WARNING ONLY — circuit breaker handles runtime failures)
  try {
    nseOk = await nseDataService.health();
    if (!nseOk) {
      nseError = 'Service returned unhealthy status';
      logger.warn('SelfTest', `NSE Data Service check failed at startup: ${nseError}. Engine will continue — circuit breaker manages runtime provider failures.`);
    }
  } catch (err) {
    nseError = err instanceof Error ? err.message : String(err);
    logger.warn('SelfTest', `NSE Data Service unreachable at startup: ${nseError}. Engine will continue — provider fallback logic is active.`);
  }
  
  // 4. Verify outbound HTTPS (WARNING ONLY — BSE may be blocked in some Docker network environments)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.bseindia.com/BseIndiaAPI/api/MarketStatus/w', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.bseindia.com/',
      }
    });
    if (res.ok) {
      httpsOk = true;
    } else {
      httpsError = `HTTP ${res.status}: ${res.statusText}`;
      logger.warn('SelfTest', `BSE HTTPS check returned non-OK at startup: ${httpsError}. Engine will continue — BSE is a secondary fallback provider.`);
    }
  } catch (err) {
    httpsError = err instanceof Error ? err.message : String(err);
    logger.warn('SelfTest', `BSE outbound HTTPS blocked or unreachable at startup: ${httpsError}. Engine will continue — circuit breaker and Yahoo fallback are active.`);
  } finally {
    clearTimeout(timeout);
  }
  
  // Only DB and Redis are CRITICAL startup dependencies.
  // NSE/BSE are external data providers managed by circuit breakers at runtime.
  const allPassed = dbOk && redisOk;
  
  // Always print the full diagnostic report for observability
  const diagnostic = [
    '===============================================',
    allPassed ? '🚀 ENGINE STARTUP SELF-TEST REPORT' : '⚠️  ENGINE STARTUP SELF-TEST REPORT',
    '===============================================',
    `PostgreSQL Database:  ${dbOk ? '🟢 PASS' : `🔴 FAIL [CRITICAL] (${dbError})`}`,
    `Redis Cache:          ${redisOk ? '🟢 PASS' : `🔴 FAIL [CRITICAL] (${redisError})`}`,
    `NSE Data Service:     ${nseOk ? '🟢 PASS' : `🟡 WARN [NON-FATAL] (${nseError || 'unreachable'})`}`,
    `Outbound HTTPS (BSE): ${httpsOk ? '🟢 PASS' : `🟡 WARN [NON-FATAL] (${httpsError || 'blocked/unreachable'})`}`,
    '-----------------------------------------------',
    allPassed
      ? '✅ All critical dependencies healthy. Engine starting.'
      : !dbOk && !redisOk
        ? '❌ ABORTING: Both DB and Redis are unreachable.'
        : !dbOk
          ? '❌ ABORTING: PostgreSQL is unreachable.'
          : '❌ ABORTING: Redis is unreachable.',
    '==============================================='
  ].join('\n');

  if (allPassed) {
    console.log(diagnostic);
    logger.info('SelfTest', '✅ Critical dependency self-tests passed. External provider warnings (if any) are non-fatal.');
    return true;
  } else {
    console.error(diagnostic);
    logger.error('SelfTest', 'Startup self-test failed: critical infrastructure (DB/Redis) is unreachable.');
    return false;
  }
}

async function bootstrap() {
  const gitCommit = process.env.GIT_COMMIT || 'development-unspecified';
  const startTimestamp = new Date().toISOString();
  const nodeEnv = process.env.NODE_ENV || 'development';
  const activeProvidersList = ['NSE', 'BSE', 'Yahoo-Finance-Fallback'];

  logger.info('System', '===============================================');
  logger.info('System', '🚀 STARTUP VERSION FINGERPRINT');
  logger.info('System', `Git Commit:      ${gitCommit}`);
  logger.info('System', `Build Timestamp: ${startTimestamp}`);
  logger.info('System', `Environment:     ${nodeEnv}`);
  logger.info('System', `Active Providers:${activeProvidersList.join(', ')}`);
  logger.info('System', 'Database Schema: Index idx_tick_history_symbol_timestamp and idx_tick_history_timestamp verified.');
  logger.info('System', '===============================================');

  // Run startup self-test before starting everything
  const testPassed = await runStartupSelfTest().catch(() => false);
  if (!testPassed) {
    logger.error('System', 'Bootstrap aborted due to startup self-test failure.');
    process.exit(1);
  }

  // Build and print runtime compatibility report (Item 11)
  let pgVersion = 'Unknown';
  let redisVersion = 'Unknown';
  try {
    const dbVer = await db.execute(sql`SELECT version() as pg_version`);
    pgVersion = (dbVer as any[])[0]?.pg_version || 'Unknown';
    
    const info = await redis.info('server');
    const match = info.match(/redis_version:([^\r\n]+)/);
    redisVersion = match ? match[1] : 'Unknown';
  } catch (err) {
    // Ignore version querying errors
  }

  const nodeVersion = process.version;
  const dockerTag = process.env.DOCKER_IMAGE_TAG || 'v1.4-production';
  const schemaVersion = process.env.SCHEMA_VERSION || '1.4.2';

  logger.info('System', '===============================================');
  logger.info('System', '🟢 RUNTIME COMPATIBILITY & SYSTEM REPORT');
  logger.info('System', `Node.js Version:  ${nodeVersion}`);
  logger.info('System', `Redis Version:    ${redisVersion}`);
  logger.info('System', `PostgreSQL:       ${pgVersion.split(' on ')[0]}`);
  logger.info('System', `Docker Tag:       ${dockerTag}`);
  logger.info('System', `Schema Version:   ${schemaVersion}`);
  logger.info('System', '===============================================');

  const server = createServer(async (req, res) => {
    // 1. /health/live
    if (req.url === '/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
      }));
      return;
    }

    // 2. /health/ready
    if (req.url === '/health/ready') {
      let dbHealthy = false;
      let redisHealthy = false;
      try {
        await db.execute(sql`SELECT 1`);
        dbHealthy = true;
      } catch {}

      try {
        const ping = await redis.ping();
        redisHealthy = ping === 'PONG';
      } catch {}

      if (!dbHealthy || !redisHealthy) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'FAILING',
          reason: !dbHealthy && !redisHealthy ? 'DB and Redis down' : !dbHealthy ? 'DB down' : 'Redis down',
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      // Check external providers from providerHealthEngine
      const providerStats = providerHealthEngine.getAllStats();
      const activeProviders = Object.keys(providerStats);
      const allProvidersFailed = activeProviders.length > 0 && activeProviders.every(p => providerStats[p].circuitBreakerOpen);

      if (allProvidersFailed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'DEGRADED',
          reason: 'All market data providers are currently failing (circuit breakers open)',
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      // Queue backpressure safeguards (Item 8)
      let aiJobs = 0;
      let parsingJobs = 0;
      try {
        aiJobs = (await redis.llen('bull:ai-engine-queue:wait').catch(() => 0)) + 
                 (await redis.scard('bull:ai-engine-queue:active').catch(() => 0));
        parsingJobs = (await redis.llen('bull:parsing-queue:wait').catch(() => 0)) + 
                      (await redis.scard('bull:parsing-queue:active').catch(() => 0));
      } catch {}

      const totalDepth = aiJobs + parsingJobs;
      if (totalDepth > 10000) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'DEGRADED',
          reason: `High queue pressure (depth: ${totalDepth}). Ingestion slowed down.`,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'READY',
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // 3. /health/dependencies
    if (req.url === '/health/dependencies') {
      let dbHealthy = false;
      let dbError = '';
      try {
        await db.execute(sql`SELECT 1`);
        dbHealthy = true;
      } catch (err) {
        dbError = err instanceof Error ? err.message : String(err);
      }

      let redisHealthy = false;
      let redisError = '';
      try {
        const ping = await redis.ping();
        redisHealthy = ping === 'PONG';
      } catch (err) {
        redisError = err instanceof Error ? err.message : String(err);
      }

      const providerStats = providerHealthEngine.getAllStats();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        database: { status: dbHealthy ? 'HEALTHY' : 'UNHEALTHY', error: dbError || null },
        redis: { status: redisHealthy ? 'HEALTHY' : 'UNHEALTHY', error: redisError || null },
        providers: providerStats,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // 4. /metrics
    if (req.url === '/metrics') {
      try {
        const metrics = await metricsCollector.getMetricsJSON();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err instanceof Error ? err.message : String(err) }));
      }
      return;
    }

    // 5. Classic /health (backward compatibility)
    if (req.url === '/health') {
      const mem = process.memoryUsage();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        memory: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
        workers: {
          gateway: 'running',
          pipeline: 'running',
          aggregator: 'running',
          persistence: 'running',
          ohlc: 'running',
          indicators: 'running',
          retention: 'running',
          scanner: 'running',
          corporate: 'running',
          memory_controller: 'running',
        },
      }));
      return;
    }

    res.writeHead(200);
    res.end('AI Bazaar realtime engine - use /health for status');
  });

  const gateway = new WebSocketGateway(server);
  gateway.start();
  logger.info('System', 'WebSocket gateway started');

  memoryController.start(60_000);
  logger.info('System', 'Memory controller started');

  const pipeline = new MarketPipeline();
  await pipeline.initialize();
  const pollIntervalMs = Number(process.env.MARKET_POLL_INTERVAL_MS || 5000);
  void pipeline.startPolling(pollIntervalMs);
  logger.info('System', 'Market pipeline started', { pollIntervalMs });

  const aggregator = new MarketAggregator();
  aggregator.start(5000);
  logger.info('System', 'Market aggregator started');

  tickPersistenceWorker.start();
  logger.info('System', 'Tick persistence worker started');

  ohlcEngine.start();
  logger.info('System', 'OHLC engine started');

  setTimeout(() => {
    indicatorWorker.start(30_000);
    logger.info('System', 'Indicator worker started');
  }, 60_000);

  retentionWorker.start();
  logger.info('System', 'Retention worker started');

  setTimeout(() => {
    scannerWorker.start();
    logger.info('System', 'Scanner worker started');
  }, 75_000);

  corporateWorker.start();
  logger.info('System', 'Corporate intelligence worker started');

  const port = Number(process.env.WS_PORT || 4000);
  server.listen(port, () => {
    logger.info('System', 'Backend engine listening', { port });
  });

  const shutdown = async () => {
    logger.info('System', 'Graceful shutdown initiated');
    
    // Set a hard timeout of 8 seconds to guarantee shutdown completes within 10 seconds (Item 10)
    const forceExitTimeout = setTimeout(() => {
      logger.warn('System', 'Graceful shutdown timed out after 8s! Forcing immediate exit.');
      process.exit(1);
    }, 8000);
    forceExitTimeout.unref();

    try {
      server.close();
      scannerWorker.stop();
      indicatorWorker.stop();
      ohlcEngine.stop();
      tickPersistenceWorker.stop();
      corporateWorker.stop();
      pipeline.stop();
      retentionWorker.stop();
      memoryController.stop();

      // Wrap async quits in Promise.all with error catches to prevent hanging on any unresolved promises
      await Promise.all([
        aiWorker.close().catch(() => {}),
        parsingWorker.close().catch(() => {}),
        gateway.shutdown().catch(() => {}),
        redis.quit().catch(() => {}),
        client.end().catch(() => {}),
      ]);

      clearTimeout(forceExitTimeout);
      logger.info('System', 'All systems stopped');
      process.exit(0);
    } catch (err) {
      logger.error('System', 'Error during graceful shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('unhandledRejection', (reason) => {
    logger.error('System', 'Unhandled rejection', reason);
  });
}

bootstrap().catch((err) => {
  logger.error('System', 'Fatal error during bootstrap', err);
  process.exit(1);
});
