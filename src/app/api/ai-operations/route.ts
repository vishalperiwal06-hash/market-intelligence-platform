import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const metricsKey = `ai:metrics:${dateStr}`;
    const latencyKey = `ai:metrics:latency`;

    const [metrics, latencies] = await Promise.all([
      redis.hgetall(metricsKey),
      redis.hgetall(latencyKey),
    ]);

    const providers = ['DeepSeek', 'Gemini', 'Groq', 'OpenRouter', 'Ollama'];
    const formattedData = providers.map(p => {
      const isCooldown = false; // We can check this if needed
      return {
        name: p,
        requests: parseInt(metrics[`${p}:requests`] || '0', 10),
        failures: parseInt(metrics[`${p}:failures`] || '0', 10),
        tokens: parseInt(metrics[`${p}:tokens`] || '0', 10),
        latencyMs: parseInt(latencies[p] || '0', 10),
        status: isCooldown ? 'cooldown' : (latencies[p] ? 'healthy' : 'unknown'),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        providers: formattedData,
        date: dateStr,
      }
    });
  } catch (error: any) {
    console.error('AI Operations API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch AI metrics' },
      { status: 500 }
    );
  }
}
