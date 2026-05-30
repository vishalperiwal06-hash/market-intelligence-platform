'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, TrendingDown, RefreshCw, Activity } from 'lucide-react';
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Tooltip,
} from 'recharts';
import { safeFloat } from '@/lib/formatters';

interface SectorData {
  sector: string;
  avgChange: number;
  totalTurnover: number;
  advances: number;
  declines: number;
  rank: number;
  stockCount?: number;
}

const SECTOR_ICONS: Record<string, string> = {
  'Information Technology': '💻',
  'IT': '💻',
  'Banking': '🏦',
  'Financial Services': '💰',
  'Finance': '💰',
  'FMCG': '🛒',
  'Consumer Goods': '🛒',
  'Pharmaceuticals': '💊',
  'Healthcare': '💊',
  'Pharma': '💊',
  'Oil & Gas': '⛽',
  'Energy': '⚡',
  'Metals': '⚙️',
  'Auto': '🚗',
  'Automobile': '🚗',
  'Realty': '🏗️',
  'Infrastructure': '🏗️',
  'Telecom': '📡',
  'Media': '📺',
  'Capital Goods': '🔧',
  'Other': '📊',
};

function getIcon(sector: string): string {
  for (const [key, icon] of Object.entries(SECTOR_ICONS)) {
    if (sector.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return '📊';
}

function formatTurnover(val: number): string {
  if (val >= 1e9) return `₹${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e7) return `₹${(val / 1e7).toFixed(1)}Cr`;
  if (val >= 1e5) return `₹${(val / 1e5).toFixed(1)}L`;
  return `₹${val.toFixed(0)}`;
}

export function SectorStrength() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'bar' | 'radar'>('bar');

  const fetchSectors = useCallback(async () => {
    try {
      const res = await fetch('/api/sectors?limit=20');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setSectors(json.data || []);
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSectors();
    const id = setInterval(fetchSectors, 30_000);
    return () => clearInterval(id);
  }, [fetchSectors]);

  // Normalize for radar — values between 0-100
  const radarData = sectors.slice(0, 8).map(s => {
    const norm = Math.min(100, Math.max(0, 50 + s.avgChange * 10));
    return { sector: s.sector.slice(0, 12), value: norm, raw: s.avgChange };
  });

  const maxAbs = Math.max(...sectors.map(s => Math.abs(s.avgChange)), 1);

  return (
    <Card className="bg-terminal-card border-zinc-850">
      <CardHeader className="pb-2 border-b border-zinc-850">
        <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono">
            <BarChart3 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            Sector Rotation
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded overflow-hidden border border-zinc-850 text-[8px] font-mono">
              {(['bar', 'radar'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2 py-0.5 transition-all ${view === v ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-600 hover:text-zinc-300'}`}
                >
                  {v === 'bar' ? 'Bars' : 'Radar'}
                </button>
              ))}
            </div>
            <button onClick={fetchSectors} className="text-zinc-600 hover:text-zinc-300 transition-all hover:rotate-180 duration-500">
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 px-3 pb-3">
        {loading && sectors.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="space-y-1" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex justify-between">
                  <div className="shimmer h-2.5 w-24 rounded" />
                  <div className="shimmer h-2.5 w-10 rounded" />
                </div>
                <div className="shimmer h-1 w-full rounded" />
              </div>
            ))}
          </div>
        ) : sectors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-zinc-600">
            <Activity className="h-5 w-5 mb-1.5 opacity-20" />
            <p className="text-[10px] font-mono">Awaiting live sector data...</p>
          </div>
        ) : view === 'bar' ? (
          <div className="space-y-2 stagger-children">
            {sectors.map((s, i) => {
              const change = safeFloat(s.avgChange);
              const isPos = change >= 0;
              const barW = Math.min(100, (Math.abs(change) / maxAbs) * 100);
              const adRatio = s.declines > 0 ? (s.advances / s.declines) : s.advances;
              return (
                <div
                  key={s.sector}
                  className="group animate-slide-in-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] opacity-70">{getIcon(s.sector)}</span>
                      <span className="text-[10px] text-zinc-300 font-semibold truncate max-w-[100px]">{s.sector}</span>
                      {s.stockCount !== undefined && (
                        <span className="text-[8px] text-zinc-700 font-mono">({s.stockCount})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-zinc-600 font-mono hidden group-hover:block">
                        A/D {adRatio.toFixed(1)}x
                      </span>
                      <span className="text-[8px] text-zinc-600 font-mono group-hover:hidden">
                        {formatTurnover(s.totalTurnover)}
                      </span>
                      <span className={`text-[10px] font-mono font-black w-12 text-right ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPos ? '+' : ''}{change.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  {/* Horizontal bar */}
                  <div className="h-1 w-full bg-zinc-900 rounded overflow-hidden">
                    <div
                      className={`h-full rounded progress-bar-animated ${isPos ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Radar view */
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="rgba(39,39,42,0.6)" />
                <PolarAngleAxis
                  dataKey="sector"
                  tick={{ fontSize: 8, fill: '#71717a', fontFamily: 'monospace' }}
                />
                <Radar
                  name="Change%"
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  strokeWidth={1.5}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(9,9,11,0.96)',
                    borderColor: '#27272a',
                    fontSize: '9px',
                    fontFamily: 'monospace',
                    borderRadius: '6px',
                  }}
                  formatter={(v: any, n: any, p: any) => [
                    `${p.payload.raw > 0 ? '+' : ''}${safeFloat(p.payload.raw).toFixed(2)}%`,
                    'Avg Chg',
                  ]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
