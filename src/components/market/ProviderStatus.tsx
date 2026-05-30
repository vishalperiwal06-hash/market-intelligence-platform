'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Server, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ProviderStats {
  successCount: number;
  failureCount: number;
  averageLatencyMs: number;
  circuitBreakerOpen: boolean;
  currentLoad: {
    reqPerSec: number;
    reqPerMin: number;
  };
}

export function ProviderStatus() {
  const [stats, setStats] = useState<Record<string, ProviderStats>>({});
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/providers');
      if (res.ok) {
        const json = await res.json();
        setStats(json.providers || {});
      }
    } catch {
      // Degrade gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [fetchStats]);

  const providers = Object.keys(stats).sort((a, b) => {
    // Sort healthy first, then by latency
    const statA = stats[a];
    const statB = stats[b];
    if (statA.circuitBreakerOpen !== statB.circuitBreakerOpen) {
      return statA.circuitBreakerOpen ? 1 : -1;
    }
    return statA.averageLatencyMs - statB.averageLatencyMs;
  });

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-400" />
            Data Source Orchestrator
          </div>
          <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
            <Activity className="h-3 w-3" /> LIVE
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading && providers.length === 0 ? (
          <div className="p-4 flex justify-center text-zinc-500"><Activity className="animate-spin h-5 w-5" /></div>
        ) : providers.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-xs">No provider telemetry available.</div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {providers.map(name => {
              const p = stats[name];
              const isHealthy = !p.circuitBreakerOpen;
              
              return (
                <div key={name} className={`p-3 flex items-center justify-between ${!isHealthy ? 'bg-rose-950/20' : ''}`}>
                  <div className="flex items-center gap-3">
                    {isHealthy ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-zinc-200">{name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {p.successCount} OK / {p.failureCount} ERR
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-xs font-mono text-zinc-300">
                      {Math.round(p.averageLatencyMs)}ms
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      {p.currentLoad.reqPerSec} req/s
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
