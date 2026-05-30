'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, TrendingDown, Activity, Flame, ArrowUpRight, ArrowDownRight,
  BarChart2, RefreshCw, Volume2,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts';
import { formatPrice, formatPercent, formatVolume, safeFloat } from '@/lib/formatters';
import Link from 'next/link';
import { CompanyLogo } from './CompanyLogo';

interface MoverStock {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
}

type Tab = 'gainers' | 'losers' | 'active';

const TABS: { key: Tab; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'gainers', label: 'Gainers',     icon: <TrendingUp   className="h-3 w-3" />, color: 'text-emerald-400' },
  { key: 'losers',  label: 'Losers',      icon: <TrendingDown className="h-3 w-3" />, color: 'text-rose-400'    },
  { key: 'active',  label: 'Most Active', icon: <Volume2      className="h-3 w-3" />, color: 'text-blue-400'    },
];

const MoverTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as MoverStock;
  return (
    <div className="bg-zinc-950/98 border border-zinc-800 rounded px-2.5 py-2 text-[9px] font-mono shadow-xl min-w-[110px]">
      <div className="font-black text-zinc-200 text-xs mb-1">{d.symbol}</div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-zinc-500">
        <span>Price</span>   <span className="text-zinc-200 text-right">{formatPrice(d.price)}</span>
        <span>Volume</span>  <span className="text-blue-300 text-right">{formatVolume(d.volume)}</span>
      </div>
    </div>
  );
};

export function TopMoversWidget() {
  const [tab, setTab]         = useState<Tab>('gainers');
  const [gainers, setGainers] = useState<MoverStock[]>([]);
  const [losers, setLosers]   = useState<MoverStock[]>([]);
  const [active, setActive]   = useState<MoverStock[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMovers = useCallback(async () => {
    try {
      // Try dedicated top-movers endpoint first
      const res = await fetch('/api/market/quotes');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.ok || !Array.isArray(json.data)) return;

      const all: MoverStock[] = json.data
        .filter((s: any) => s?.symbol && s?.price > 0)
        .map((s: any) => ({
          symbol:        s.symbol,
          price:         safeFloat(s.price),
          change:        safeFloat(s.change),
          changePercent: safeFloat(s.changePercent),
          volume:        safeFloat(s.volume),
          turnover:      safeFloat(s.turnover),
          high:          safeFloat(s.high),
          low:           safeFloat(s.low),
        }));

      const sorted = [...all].sort((a, b) => b.changePercent - a.changePercent);
      setGainers(sorted.slice(0, 10));
      setLosers([...sorted].reverse().slice(0, 10));
      setActive([...all].sort((a, b) => b.volume - a.volume).slice(0, 10));
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMovers();
    const id = setInterval(fetchMovers, 30_000);
    return () => clearInterval(id);
  }, [fetchMovers]);

  const currentList = tab === 'gainers' ? gainers : tab === 'losers' ? losers : active;
  const currentTab  = TABS.find(t => t.key === tab)!;

  // Build chart data
  const chartData = currentList.slice(0, 8).map(s => ({
    ...s,
    value: tab === 'active' ? s.volume : Math.abs(s.changePercent),
    fill:  tab === 'active'
      ? 'rgba(59,130,246,0.7)'
      : tab === 'gainers'
        ? 'rgba(16,185,129,0.7)'
        : 'rgba(239,68,68,0.7)',
  }));

  return (
    <Card className="bg-terminal-card border-zinc-850 overflow-hidden">
      <CardHeader className="pb-2 border-b border-zinc-850">
        <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            Market Movers
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded overflow-hidden border border-zinc-850 text-[8px] font-mono">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-0.5 px-2 py-0.5 transition-all ${
                    tab === t.key
                      ? 'bg-zinc-800 text-zinc-100 font-bold'
                      : 'text-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  <span className={tab === t.key ? t.color : ''}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <button onClick={fetchMovers} className="text-zinc-600 hover:text-zinc-300 hover:rotate-180 transition-all duration-500">
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading && currentList.length === 0 ? (
          <div className="p-3 space-y-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center gap-2">
                <div className="shimmer h-3 w-16 rounded" style={{ animationDelay: `${i * 40}ms` }} />
                <div className="shimmer h-3 w-12 rounded" />
                <div className="shimmer h-3 w-10 rounded" />
              </div>
            ))}
          </div>
        ) : currentList.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-zinc-600 text-xs font-mono">
            <Activity className="h-4 w-4 mr-1.5 opacity-20" /> No data yet
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Mini chart */}
            <div className="h-[90px] px-1 pt-2 border-b border-zinc-900/60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
                  <XAxis
                    dataKey="symbol"
                    tick={{ fontSize: 7, fill: '#52525b', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={22}
                  />
                  <YAxis hide />
                  <Tooltip content={<MoverTooltip />} />
                  <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={18}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="overflow-y-auto max-h-[220px]">
              <table className="w-full text-[9px] font-mono border-collapse">
                <thead className="sticky top-0 bg-zinc-950/95 z-10">
                  <tr className="border-b border-zinc-900">
                    <th className="text-left py-1.5 px-3 text-zinc-600 font-bold uppercase tracking-wider">#</th>
                    <th className="text-left py-1.5 px-1 text-zinc-600 font-bold uppercase tracking-wider">Symbol</th>
                    <th className="text-right py-1.5 px-2 text-zinc-600 font-bold uppercase tracking-wider">Price</th>
                    <th className="text-right py-1.5 px-2 text-zinc-600 font-bold uppercase tracking-wider">Chg%</th>
                    <th className="text-right py-1.5 px-2 text-zinc-600 font-bold uppercase tracking-wider">Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/40">
                  {currentList.map((stock, i) => {
                    const isUp = stock.changePercent >= 0;
                    return (
                      <tr
                        key={stock.symbol}
                        className="hover:bg-zinc-900/45 border-b border-zinc-900/20 group animate-slide-in-up hover:translate-x-1 duration-200 transition-all cursor-pointer"
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        <td className="py-1 px-3 text-zinc-700">{i + 1}</td>
                        <td className="py-1.5 px-1">
                          <Link
                            href={`/stocks/${stock.symbol.toLowerCase()}`}
                            className="text-zinc-200 font-bold group-hover:text-blue-400 transition-colors flex items-center gap-2"
                          >
                            <CompanyLogo symbol={stock.symbol} size="sm" />
                            <span className="flex items-center gap-0.5">
                              {stock.symbol}
                              <ArrowUpRight className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </span>
                          </Link>
                        </td>
                        <td className="py-1 px-2 text-right text-zinc-300 font-medium font-mono">
                          {formatPrice(stock.price)}
                        </td>
                        <td className={`py-1 px-2 text-right font-black ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                          <span className="inline-flex items-center gap-0.5 font-mono">
                            {isUp ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                            {formatPercent(stock.changePercent)}
                          </span>
                        </td>
                        <td className="py-1 px-2 text-right text-zinc-500 font-mono">
                          {formatVolume(stock.volume)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
