'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';

interface Diagnostics {
  jobs_started?: string;
  jobs_completed?: string;
  jobs_failed?: string;
  jobs_with_errors?: string;
  [key: string]: string | undefined;
}

export function ParsingDiagnosticsWidget() {
  const [diag, setDiag] = useState<Diagnostics>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/corporate/parsing-diagnostics');
        if (res.ok) {
          const json = await res.json();
          setDiag(json.diagnostics || {});
        }
      } catch { /* graceful */ }
      finally { setLoading(false); }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const stat = (key: string) => parseInt(diag[key] || '0');

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          Parsing Pipeline Health
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 animate-pulse">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-zinc-800/60 rounded" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-zinc-800/30 rounded-md border border-zinc-800">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase tracking-wider mb-1">
                <FileText className="h-3 w-3" /> Jobs Started
              </div>
              <div className="text-lg font-bold text-zinc-200 font-mono">{stat('jobs_started')}</div>
            </div>

            <div className="p-3 bg-zinc-800/30 rounded-md border border-zinc-800">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase tracking-wider mb-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Completed
              </div>
              <div className="text-lg font-bold text-emerald-400 font-mono">{stat('jobs_completed')}</div>
            </div>

            <div className="p-3 bg-zinc-800/30 rounded-md border border-zinc-800">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase tracking-wider mb-1">
                <XCircle className="h-3 w-3 text-rose-500" /> Failed
              </div>
              <div className="text-lg font-bold text-rose-400 font-mono">{stat('jobs_failed')}</div>
            </div>

            <div className="p-3 bg-zinc-800/30 rounded-md border border-zinc-800">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase tracking-wider mb-1">
                <Clock className="h-3 w-3 text-amber-500" /> With Warnings
              </div>
              <div className="text-lg font-bold text-amber-400 font-mono">{stat('jobs_with_errors')}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
