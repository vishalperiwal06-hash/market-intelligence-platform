/**
 * OPERATOR CONTROL CENTER API — Phase 21
 * 
 * Provides unified access to all infrastructure telemetry, 
 * worker states, AI costs, and transport performance.
 */
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { metricsCollector } from '@/server/observability/metrics-collector';
import { costGovernor } from '@/server/ai-orchestrator/cost-governor';
import { transportOptimizer } from '@/server/realtime/transport-optimizer';

export async function GET(request: NextRequest) {
  try {
    // 1. Collect System Metrics
    const metrics = await metricsCollector.collect();
    const anomalies = await metricsCollector.detectAnomalies(metrics);

    // 2. Get Worker Status from Redis
    const workerStats = await redis.hgetall('infra:worker:heartbeats');
    const workers = Object.entries(workerStats).map(([name, data]) => ({
      name,
      ...JSON.parse(data),
    }));

    // 3. Get AI Budget Report
    const budget = await costGovernor.getBudgetReport();

    // 4. Get Transport Efficiency
    const transport = transportOptimizer.getMetrics();

    return NextResponse.json({
      timestamp: Date.now(),
      status: anomalies.length > 0 ? 'DEGRADED' : 'HEALTHY',
      anomalies,
      metrics,
      workers,
      budget,
      transport,
      topology: {
        totalWorkers: workers.length,
        activeStreams: 12, // Simulated count
        queueHealth: 'OPTIMAL'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch telemetry', details: err.message }, { status: 500 });
  }
}
