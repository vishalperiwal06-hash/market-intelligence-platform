'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LayoutGrid, RefreshCw, Layers } from 'lucide-react';
import { safeFloat } from '@/lib/formatters';

interface HeatmapStock {
  symbol: string;
  name?: string;
  changePercent: number;
  volume?: number;
  turnover?: number;
  sector?: string;
}

function getHeatColor(pct: number): string {
  if (pct >= 4)    return 'bg-emerald-600/80 text-emerald-100 border-emerald-500/40';
  if (pct >= 2)    return 'bg-emerald-700/60 text-emerald-200 border-emerald-600/30';
  if (pct >= 0.5)  return 'bg-emerald-900/50 text-emerald-300 border-emerald-700/20';
  if (pct >= 0)    return 'bg-emerald-950/40 text-emerald-400 border-emerald-900/20';
  if (pct >= -0.5) return 'bg-rose-950/40 text-rose-400 border-rose-900/20';
  if (pct >= -2)   return 'bg-rose-900/50 text-rose-300 border-rose-700/20';
  if (pct >= -4)   return 'bg-rose-700/60 text-rose-200 border-rose-600/30';
  return 'bg-rose-600/80 text-rose-100 border-rose-500/40';
}

function getIntensityGlow(pct: number): string {
  if (Math.abs(pct) >= 4) return 'shadow-[0_0_8px_rgba(0,200,100,0.3)]';
  return '';
}

export function MarketHeatmap() {
  const [stocks, setStocks] = useState<HeatmapStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'all' | 'sectors'>('all');
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/market/quotes');
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        const mapped: HeatmapStock[] = json.data
          .filter((s: any) => s?.symbol && s?.changePercent !== undefined)
          .map((s: any) => ({
            symbol: s.symbol,
            name: s.name || s.symbol,
            changePercent: safeFloat(s.changePercent),
            volume: safeFloat(s.volume),
            turnover: safeFloat(s.turnover),
            sector: s.sector || 'Other',
          }))
          .sort((a: HeatmapStock, b: HeatmapStock) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
        setStocks(mapped);
        setLastUpdate(new Date().toLocaleTimeString('en-IN'));
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Group by sector
  const sectorMap: Record<string, HeatmapStock[]> = {};
  stocks.forEach(s => {
    const sec = s.sector || 'Other';
    if (!sectorMap[sec]) sectorMap[sec] = [];
    sectorMap[sec].push(s);
  });

  const displayStocks = stocks.slice(0, 60);

  return (
    <Card className="bg-terminal-card border-zinc-850">
      <CardHeader className="pb-2 border-b border-zinc-850">
        <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono">
            <LayoutGrid className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            Market Heatmap
            {stocks.length > 0 && (
              <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[8px] font-mono ml-1">
                {stocks.length} stocks
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded overflow-hidden border border-zinc-850 text-[9px] font-mono">
              {(['all', 'sectors'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2 py-0.5 transition-all ${view === v ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {v === 'all' ? 'All' : 'Sectors'}
                </button>
              ))}
            </div>
            <button
              onClick={fetchData}
              className="text-zinc-600 hover:text-zinc-300 transition-all hover:rotate-180 duration-500"
              title="Refresh"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {loading && stocks.length === 0 ? (
          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="shimmer h-10 rounded" style={{ animationDelay: `${i * 30}ms` }} />
            ))}
          </div>
        ) : stocks.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-zinc-600">
            <Layers className="h-6 w-6 mb-2 opacity-20" />
            <p className="text-xs">Awaiting market data stream...</p>
          </div>
        ) : view === 'all' ? (
          <>
            <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 stagger-children">
              {displayStocks.map((stock, i) => {
                const colorClass = getHeatColor(stock.changePercent);
                const glow = getIntensityGlow(stock.changePercent);
                const pct = stock.changePercent;
                return (
                  <div
                    key={stock.symbol}
                    title={`${stock.symbol}\n${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`}
                    className={`
                      relative flex flex-col items-center justify-center 
                      rounded border cursor-default select-none
                      p-1 h-[48px] transition-all duration-300
                      hover:scale-110 hover:z-10 animate-slide-in-up
                      ${colorClass} ${glow}
                    `}
                    style={{ animationDelay: `${i * 15}ms` }}
                  >
                    <span className="text-[8px] font-bold font-mono truncate w-full text-center leading-tight">
                      {stock.symbol.length > 6 ? stock.symbol.slice(0, 6) : stock.symbol}
                    </span>
                    <span className="text-[8px] font-black font-mono leading-tight">
                      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-1 mt-2 justify-center flex-wrap">
              {[
                { label: '>4%', cls: 'bg-emerald-600/80' },
                { label: '2-4%', cls: 'bg-emerald-700/60' },
                { label: '0-2%', cls: 'bg-emerald-900/50' },
                { label: '0', cls: 'bg-zinc-700/50' },
                { label: '0-2%', cls: 'bg-rose-900/50' },
                { label: '2-4%', cls: 'bg-rose-700/60' },
                { label: '>4%', cls: 'bg-rose-600/80' },
              ].map((l, i) => (
                <div key={i} className="flex items-center gap-0.5">
                  <div className={`w-3 h-2 rounded-sm ${l.cls}`} />
                  <span className="text-[7px] text-zinc-600 font-mono">{l.label}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {Object.entries(sectorMap)
              .sort(([, a], [, b]) => {
                const avgA = a.reduce((s, x) => s + x.changePercent, 0) / a.length;
                const avgB = b.reduce((s, x) => s + x.changePercent, 0) / b.length;
                return avgB - avgA;
              })
              .slice(0, 12)
              .map(([sector, sStocks]) => {
                const avg = sStocks.reduce((s, x) => s + x.changePercent, 0) / sStocks.length;
                return (
                  <div key={sector} className="space-y-1 animate-slide-in-up">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 font-mono truncate max-w-[120px]">
                        {sector}
                      </span>
                      <span className={`text-[9px] font-black font-mono ${avg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {avg >= 0 ? '+' : ''}{avg.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex gap-0.5 flex-wrap">
                      {sStocks.slice(0, 15).map(s => (
                        <div
                          key={s.symbol}
                          title={`${s.symbol}: ${s.changePercent.toFixed(2)}%`}
                          className={`text-[7px] font-bold font-mono px-1 py-0.5 rounded border ${getHeatColor(s.changePercent)} transition-all hover:scale-110 cursor-default`}
                        >
                          {s.symbol.slice(0, 5)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        {lastUpdate && (
          <div className="text-[8px] text-zinc-700 font-mono mt-2 text-right">
            Updated: {lastUpdate}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
