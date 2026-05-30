'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, Zap, AlertTriangle, ShieldCheck, Cpu } from 'lucide-react';

interface ProviderStats {
  name: string;
  requests: number;
  failures: number;
  tokens: number;
  latencyMs: number;
  status: 'healthy' | 'cooldown' | 'unknown';
}

export function AIProviderStatus() {
  const [providers, setProviders] = useState<ProviderStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/ai-operations');
        if (res.ok) {
          const json = await res.json();
          setProviders(json.data.providers);
        }
      } catch (e) {
        console.error('Failed to load AI stats', e);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="text-zinc-500 text-sm animate-pulse">Loading AI telemetry...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {providers.map(p => (
        <Card key={p.name} className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                {p.name === 'Ollama' ? <Cpu className="h-4 w-4 text-blue-400" /> : <Server className="h-4 w-4 text-emerald-400" />}
                {p.name}
              </CardTitle>
              {p.status === 'healthy' && <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20">Online</Badge>}
              {p.status === 'cooldown' && <Badge variant="destructive" className="flex gap-1"><AlertTriangle className="h-3 w-3" /> Cooldown</Badge>}
              {p.status === 'unknown' && <Badge variant="outline" className="text-zinc-500">Idle</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-3 mt-2 text-xs">
              <div className="flex flex-col">
                <span className="text-zinc-500">Requests (24h)</span>
                <span className="font-mono text-zinc-300 text-sm">{p.requests.toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-500">Failures</span>
                <span className={`font-mono text-sm ${p.failures > 0 ? 'text-rose-400' : 'text-zinc-300'}`}>
                  {p.failures.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-500">Tokens Processed</span>
                <span className="font-mono text-zinc-300 text-sm">{p.tokens.toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-500">Avg Latency</span>
                <span className="font-mono text-zinc-300 text-sm flex items-center gap-1">
                  <Zap className="h-3 w-3 text-amber-400" />
                  {p.latencyMs > 0 ? `${p.latencyMs}ms` : '--'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
