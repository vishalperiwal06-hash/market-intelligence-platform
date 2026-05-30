/**
 * OPS CENTER API — Phase 19 (Enhanced)
 *
 * GET /api/ops
 *
 * Returns comprehensive infrastructure telemetry:
 * - AI provider metrics & quotas
 * - Redis memory, key counts, stream lengths
 * - WebSocket gateway metrics
 * - Node.js heap stats
 * - Stream health for replay engine
 * - Circuit breaker states
 */
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { RT_STREAMS } from '@/server/realtime/event-bus';

export async function GET(request: NextRequest) {
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const monthStr = dateStr.slice(0, 7);

    // Gather all metrics in a single Redis pipeline
    const pipe = redis.pipeline();
    pipe.hgetall(`ai:metrics:${dateStr}`);       // [0] AI daily metrics
    pipe.hgetall(`ai:metrics:latency`);           // [1] AI latencies
    pipe.get(`ai:quota:${monthStr}:DeepSeek`);    // [2] DeepSeek quota
    pipe.dbsize();                                 // [3] key count
    pipe.info('memory');                           // [4] memory info
    pipe.info('clients');                          // [5] client info
    pipe.get('ws:gateway:metrics');                // [6] WS gateway metrics
    // Stream lengths
    pipe.xlen(RT_STREAMS.MARKET_TICKS);           // [7]
    pipe.xlen(RT_STREAMS.SIGNALS);                // [8]
    pipe.xlen(RT_STREAMS.AI_DECISIONS);           // [9]
    pipe.xlen(RT_STREAMS.OPS);                    // [10]
    // Circuit breaker states
    pipe.get('circuit:Ollama:failures');           // [11]
    pipe.get('circuit:Gemini:failures');           // [12]
    pipe.get('circuit:DeepSeek:failures');         // [13]
    pipe.get('circuit:Groq:failures');             // [14]

    const results = await pipe.exec();

    const dailyMetrics = (results?.[0]?.[1] as Record<string, string>) || {};
    const latencies = (results?.[1]?.[1] as Record<string, string>) || {};
    const deepseekQuota = parseInt((results?.[2]?.[1] as string) || '0');
    const redisKeyCount = (results?.[3]?.[1] as number) || 0;
    const memoryInfo = (results?.[4]?.[1] as string) || '';
    const clientInfo = (results?.[5]?.[1] as string) || '';
    const wsMetricsRaw = (results?.[6]?.[1] as string) || null;

    // Parse Redis memory
    const usedMemMatch = memoryInfo.match(/used_memory_human:([^\r\n]+)/);
    const usedMemory = usedMemMatch ? usedMemMatch[1].trim() : 'N/A';
    const usedMemBytes = parseInt(memoryInfo.match(/used_memory:(\d+)/)?.[1] || '0');

    // Parse connected clients
    const connectedClients = parseInt(clientInfo.match(/connected_clients:(\d+)/)?.[1] || '0');

    // Parse WS gateway metrics
    const wsMetrics = wsMetricsRaw ? JSON.parse(wsMetricsRaw) : null;

    // Stream lengths
    const streamLengths = {
      [RT_STREAMS.MARKET_TICKS]:  (results?.[7]?.[1] as number) || 0,
      [RT_STREAMS.SIGNALS]:       (results?.[8]?.[1] as number) || 0,
      [RT_STREAMS.AI_DECISIONS]:  (results?.[9]?.[1] as number) || 0,
      [RT_STREAMS.OPS]:           (results?.[10]?.[1] as number) || 0,
    };

    // Circuit breaker states
    const circuitBreakers = {
      Ollama:   parseInt((results?.[11]?.[1] as string) || '0'),
      Gemini:   parseInt((results?.[12]?.[1] as string) || '0'),
      DeepSeek: parseInt((results?.[13]?.[1] as string) || '0'),
      Groq:     parseInt((results?.[14]?.[1] as string) || '0'),
    };

    // AI provider stats
    const providers = ['DeepSeek', 'Gemini', 'Groq', 'OpenRouter', 'Ollama'];
    const providerStats = providers.map(p => ({
      name: p,
      requests: parseInt(dailyMetrics[`${p}:requests`] || '0'),
      failures: parseInt(dailyMetrics[`${p}:failures`] || '0'),
      tokens: parseInt(dailyMetrics[`${p}:tokens`] || '0'),
      latencyMs: parseInt(latencies[p] || '0'),
      circuitFailures: circuitBreakers[p as keyof typeof circuitBreakers] || 0,
    }));

    const totalRequests = providerStats.reduce((sum, p) => sum + p.requests, 0);
    const totalFailures = providerStats.reduce((sum, p) => sum + p.failures, 0);
    const totalTokens = providerStats.reduce((sum, p) => sum + p.tokens, 0);

    // Node.js process stats
    const mem = process.memoryUsage();

    return NextResponse.json({
      success: true,
      data: {
        date: dateStr,
        providers: providerStats,
        summary: {
          totalRequests,
          totalFailures,
          totalTokens,
          failureRate: totalRequests > 0 ? ((totalFailures / totalRequests) * 100).toFixed(1) : '0.0',
        },
        quotas: {
          deepseekMonthly: deepseekQuota,
          deepseekLimit: 5_000_000,
          deepseekUsagePct: ((deepseekQuota / 5_000_000) * 100).toFixed(1),
        },
        infrastructure: {
          redisKeyCount,
          redisMemory: usedMemory,
          redisMemoryBytes: usedMemBytes,
          redisConnectedClients: connectedClients,
        },
        transport: {
          wsGateway: wsMetrics,
          streams: streamLengths,
          totalStreamEvents: Object.values(streamLengths).reduce((a, b) => a + b, 0),
        },
        circuitBreakers,
        nodeProcess: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
          uptimeSeconds: Math.round(process.uptime()),
        },
      }
    });
  } catch (error: any) {
    console.error('Ops API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch ops metrics' }, { status: 500 });
  }
}
