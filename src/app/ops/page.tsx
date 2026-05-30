'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Server, Cpu, AlertTriangle, Zap, Database, Shield, HardDrive, BarChart3 } from 'lucide-react';

interface ProviderStat {
  name: string; requests: number; failures: number; tokens: number; latencyMs: number;
}
interface OpsData {
  date: string;
  providers: ProviderStat[];
  summary: { totalRequests: number; totalFailures: number; totalTokens: number; failureRate: string };
  quotas: { deepseekMonthly: number; deepseekLimit: number; deepseekUsagePct: string };
  infrastructure: { redisKeyCount: number; redisMemory: string };
}

export default function OpsPage() {
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOps() {
      try {
        const res = await fetch('/api/ops');
        if (res.ok) { const json = await res.json(); setData(json.data); }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    fetchOps();
    const i = setInterval(fetchOps, 8000);
    return () => clearInterval(i);
  }, []);

  if (loading) return <div className="text-zinc-500 animate-pulse p-8">Loading operations telemetry...</div>;

  return (
    <div className="space-y-6 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
          <Activity className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Operations Center</h1>
          <p className="text-xs text-zinc-500">Infrastructure observability, AI telemetry, and security posture</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="pt-4">
            <div className="text-xs text-zinc-500 mb-1">Total AI Requests (24h)</div>
            <div className="text-2xl font-mono text-zinc-100">{data?.summary.totalRequests.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="pt-4">
            <div className="text-xs text-zinc-500 mb-1">Failure Rate</div>
            <div className={`text-2xl font-mono ${parseFloat(data?.summary.failureRate || '0') > 10 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {data?.summary.failureRate || '0.0'}%
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="pt-4">
            <div className="text-xs text-zinc-500 mb-1">Tokens Consumed (24h)</div>
            <div className="text-2xl font-mono text-zinc-100">{data?.summary.totalTokens.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="pt-4">
            <div className="text-xs text-zinc-500 mb-1">DeepSeek Quota (Monthly)</div>
            <div className="text-sm font-mono text-zinc-300">{data?.quotas.deepseekUsagePct || '0'}% used</div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${parseFloat(data?.quotas.deepseekUsagePct || '0') > 80 ? 'bg-rose-500' : 'bg-blue-500'}`}
                style={{ width: `${data?.quotas.deepseekUsagePct || 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provider Grid + Infra */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
            <Server className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-300">AI Provider Telemetry</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data?.providers.map(p => (
              <Card key={p.name} className="bg-zinc-950/60 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {p.name === 'Ollama' ? <Cpu className="h-4 w-4 text-blue-400" /> : <Server className="h-4 w-4 text-emerald-400" />}
                      {p.name}
                    </span>
                    {p.requests > 0 && p.failures === 0 && <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-[10px]">Healthy</Badge>}
                    {p.failures > 0 && <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />{p.failures} fail</Badge>}
                    {p.requests === 0 && <Badge variant="outline" className="text-zinc-500 text-[10px]">Idle</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-y-2 text-xs mt-1">
                    <div><span className="text-zinc-500">Requests</span><br/><span className="font-mono text-zinc-300">{p.requests}</span></div>
                    <div><span className="text-zinc-500">Tokens</span><br/><span className="font-mono text-zinc-300">{p.tokens.toLocaleString()}</span></div>
                    <div className="col-span-2"><span className="text-zinc-500">Latency</span><br/>
                      <span className="font-mono text-zinc-300 flex items-center gap-1"><Zap className="h-3 w-3 text-amber-400" />{p.latencyMs > 0 ? `${p.latencyMs}ms` : '--'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Infrastructure Sidebar */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
            <HardDrive className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-300">Infrastructure</h2>
          </div>

          <Card className="bg-zinc-950/60 border-zinc-800">
            <CardContent className="pt-4 space-y-4">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500 flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-red-400" /> Redis Keys</span>
                <span className="font-mono text-zinc-300">{data?.infrastructure.redisKeyCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500 flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5 text-blue-400" /> Redis Memory</span>
                <span className="font-mono text-zinc-300">{data?.infrastructure.redisMemory}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-950/20 border-blue-900/30">
            <CardContent className="pt-4">
              <h3 className="text-xs font-semibold text-blue-400 flex items-center gap-1.5 mb-3"><Shield className="h-3.5 w-3.5" /> Security Posture</h3>
              <ul className="text-xs text-zinc-400 space-y-2">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> HSTS Enforced</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> CSP Active</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Prompt Injection Guard Active</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Per-User Rate Limiting Active</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> AI Output Leak Scanner Active</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
