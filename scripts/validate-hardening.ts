import { acquireLock, releaseLock, redis } from '../src/lib/redis';
import { ohlcEngine } from '../src/server/market-engine/workers/ohlc-engine';
import { metricsCollector } from '../src/lib/metrics-collector';
import { logger } from '../src/lib/logger';

async function testLockExpiryAndOwnership() {
  logger.info('ValidateHardening', '▶️ Starting verification for lock expiry edge-cases & ownership...');

  const lockKey = 'test:lock:chaos:validation';
  const ownerA = 'worker-A-token';
  const ownerB = 'worker-B-token';
  const ttlMs = 1500; // 1.5 seconds

  // 1. Acquire lock under Worker A
  const acquiredA = await acquireLock(lockKey, ownerA, ttlMs);
  if (!acquiredA) {
    throw new Error('Failed to acquire lock under Worker A initially');
  }
  logger.info('ValidateHardening', '✔ Worker A successfully acquired the lock.');

  // 2. Try acquiring lock under Worker B immediately — should fail
  const acquiredBImmediate = await acquireLock(lockKey, ownerB, ttlMs);
  if (acquiredBImmediate) {
    throw new Error('Error: Worker B acquired lock while Worker A still holds it!');
  }
  logger.info('ValidateHardening', '✔ Worker B blocked from acquiring locked resource.');

  // 3. Worker A crashes (simulated by not releasing). Wait for lock to expire naturally
  logger.info('ValidateHardening', '... Simulating Worker A crash. Waiting for lock TTL to expire...');
  await new Promise((resolve) => setTimeout(resolve, ttlMs + 500));

  // 4. Try acquiring under Worker B now — should succeed
  const acquiredBAfterExpiry = await acquireLock(lockKey, ownerB, ttlMs);
  if (!acquiredBAfterExpiry) {
    throw new Error('Error: Lock failed to expire or Worker B could not resume after crash.');
  }
  logger.info('ValidateHardening', '✔ Lock TTL expired correctly. Worker B resumed and acquired lock safely.');

  // 5. Worker A wakes up and tries to release lock. Should fail because Worker B owns it now!
  const releasedByAFails = await releaseLock(lockKey, ownerA);
  if (releasedByAFails) {
    throw new Error('Error: Worker A released Worker B\'s lock! Lua compare-and-delete is broken.');
  }
  logger.info('ValidateHardening', '✔ Worker A rejected from releasing Worker B\'s lock (ownership validated).');

  // 6. Worker B releases the lock successfully
  const releasedByB = await releaseLock(lockKey, ownerB);
  if (!releasedByB) {
    throw new Error('Error: Worker B failed to release its own lock');
  }
  logger.info('ValidateHardening', '✔ Worker B released its lock successfully.');
  logger.info('ValidateHardening', '🎉 Lock expiry & ownership edge cases validated flawlessly.');
}

async function testTimestampBucketAlignment() {
  logger.info('ValidateHardening', '▶️ Starting verification for timestamp bucket alignment...');

  // Test across different timezone/DST boundaries (expressed as UTC milliseconds)
  const sampleTimes = [
    new Date('2026-05-22T12:34:56.789Z'), // Arbitrary UTC time
    new Date('2026-12-31T23:59:59.999Z'), // Year transition
    new Date('2026-03-29T01:00:00.000Z'), // Typical DST transition start
  ];

  for (const time of sampleTimes) {
    // 1m alignment
    const b1m = ohlcEngine.getBucketStart(time, '1m');
    if (b1m.getUTCSeconds() !== 0 || b1m.getUTCMilliseconds() !== 0) {
      throw new Error(`1m alignment failed for ${time.toISOString()}: got ${b1m.toISOString()}`);
    }

    // 5m alignment
    const b5m = ohlcEngine.getBucketStart(time, '5m');
    if (b5m.getUTCMinutes() % 5 !== 0 || b5m.getUTCSeconds() !== 0) {
      throw new Error(`5m alignment failed for ${time.toISOString()}: got ${b5m.toISOString()}`);
    }

    // 15m alignment
    const b15m = ohlcEngine.getBucketStart(time, '15m');
    if (b15m.getUTCMinutes() % 15 !== 0 || b15m.getUTCSeconds() !== 0) {
      throw new Error(`15m alignment failed for ${time.toISOString()}: got ${b15m.toISOString()}`);
    }
  }

  logger.info('ValidateHardening', '✔ UTC Time alignment validated on 1m, 5m, and 15m boundaries across DST/date shifts.');
}

async function runAll() {
  try {
    await testLockExpiryAndOwnership();
    await testTimestampBucketAlignment();
    logger.info('ValidateHardening', '✅ All programmatic hardening checks passed successfully.');
    process.exit(0);
  } catch (err) {
    logger.error('ValidateHardening', '❌ Programmatic hardening validation failed:', err);
    process.exit(1);
  }
}

runAll();
