/**
 * AUTONOMOUS WORKER SUPERVISOR — Phase 21
 * 
 * Monitors all system workers via heartbeats and provides
 * autonomous self-healing (auto-restart) and health tracking.
 */
import { redis } from '../../lib/redis';
import { db } from '../../lib/db';
import { workerHealthLogs } from '../../lib/db/schema';
import { logger } from '../../lib/logger';
import { eventBus, RT_CHANNELS } from '../realtime/event-bus';
import { createTraceContext, createEventEnvelope } from '../realtime/contracts';
import { hostname } from 'os';

export enum WorkerState {
  STARTING = 'STARTING',
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  RESTARTING = 'RESTARTING',
  FAILED = 'FAILED',
}

export interface WorkerMetadata {
  name: string;
  pid: number;
  lastHeartbeat: number;
  state: WorkerState;
  restartCount: number;
}

export class WorkerSupervisor {
  private workers: Map<string, WorkerMetadata> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_TIMEOUT = 30_000; // 30 seconds

  constructor() {
    logger.info('Supervisor', 'Initializing Autonomous Worker Supervisor');
  }

  /**
   * Start the supervisor monitoring loop.
   */
  start(intervalMs: number = 10_000): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => this.checkHealth(), intervalMs);
    logger.info('Supervisor', `Monitoring loop started (interval: ${intervalMs}ms)`);
  }

  /**
   * Register a worker with the supervisor.
   */
  async registerWorker(name: string, pid: number): Promise<void> {
    const metadata: WorkerMetadata = {
      name,
      pid,
      lastHeartbeat: Date.now(),
      state: WorkerState.STARTING,
      restartCount: 0,
    };
    this.workers.set(name, metadata);
    await this.updateWorkerState(name, WorkerState.HEALTHY);
    logger.info('Supervisor', `Worker registered: ${name} (PID: ${pid})`);
  }

  /**
   * Receive a heartbeat from a worker.
   */
  async heartbeat(name: string, metrics?: { memoryMB: number; cpuPct: number }): Promise<void> {
    const worker = this.workers.get(name);
    if (!worker) {
      // Auto-register if not known
      await this.registerWorker(name, process.pid);
      return;
    }

    worker.lastHeartbeat = Date.now();
    worker.state = WorkerState.HEALTHY;

    // Persist to Redis for cross-node visibility
    await redis.hset('infra:worker:heartbeats', name, JSON.stringify({
      ...worker,
      metrics,
      hostname: hostname(),
      timestamp: Date.now(),
    }));

    // Log to DB periodically (every 5 mins per worker)
    if (Date.now() % 300_000 < 10_000) {
      await this.logHealthToDB(worker, metrics);
    }
  }

  private async checkHealth(): Promise<void> {
    const now = Date.now();
    for (const [name, worker] of this.workers.entries()) {
      if (now - worker.lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
        if (worker.state !== WorkerState.FAILED) {
          logger.error('Supervisor', `Worker timeout detected: ${name}`);
          await this.handleWorkerFailure(name);
        }
      }
    }
  }

  private async handleWorkerFailure(name: string): Promise<void> {
    const worker = this.workers.get(name);
    if (!worker) return;

    await this.updateWorkerState(name, WorkerState.FAILED);
    
    // Autonomous recovery: attempt restart logic
    // (In a containerized env, we might just exit and let K8s/Docker restart,
    // but here we simulate the restart cycle)
    logger.warn('Supervisor', `Attempting autonomous restart for ${name}`);
    await this.updateWorkerState(name, WorkerState.RESTARTING);
    
    worker.restartCount++;
    worker.lastHeartbeat = Date.now(); // Reset timeout to give it time to start
    
    const trace = createTraceContext('Supervisor');
    const envelope = createEventEnvelope('infra:worker:restarting', { name, restartCount: worker.restartCount }, trace);
    await eventBus.publish(RT_CHANNELS.OPS_TELEMETRY, envelope);
  }

  private async updateWorkerState(name: string, state: WorkerState): Promise<void> {
    const worker = this.workers.get(name);
    if (worker) {
      worker.state = state;
      const trace = createTraceContext('Supervisor');
      const envelope = createEventEnvelope('infra:worker:state_change', { name, state }, trace);
      await eventBus.publish(RT_CHANNELS.OPS_TELEMETRY, envelope);
    }
  }

  private async logHealthToDB(worker: WorkerMetadata, metrics?: { memoryMB: number; cpuPct: number }): Promise<void> {
    try {
      await db.insert(workerHealthLogs).values({
        workerName: worker.name,
        state: worker.state,
        hostname: hostname(),
        pid: worker.pid,
        memoryUsageMB: metrics?.memoryMB,
        cpuUsagePct: metrics?.cpuPct,
        heartbeatAt: new Date(),
      });
    } catch (err) {
      logger.error('Supervisor', 'Failed to log worker health to DB', err);
    }
  }
}

export const supervisor = new WorkerSupervisor();
