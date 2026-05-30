'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Line,
} from 'recharts';
import { TrendingUp, TrendingDown, Activity, RefreshCw, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { safeFloat, formatPrice, formatPercent, formatVolume } from '@/lib/formatters';

interface CandleData {
  t: string;     // time label
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  hl?: [number, number];
  oc?: [number, number];
  isGreen?: boolean;
  date?: string;
}

const PERIODS = [
  { label: '1W',  value: '1W' },
  { label: '1M',  value: '1M' },
  { label: '3M',  value: '3M' },
  { label: '6M',  value: '6M' },
  { label: '1Y',  value: '1Y' },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as CandleData;
  if (!d) return null;
  const isGreen = d.c >= d.o;
  return (
    <div className="bg-zinc-950/98 border border-zinc-800 rounded px-3 py-2 text-[9px] font-mono shadow-2xl min-w-[120px]">
      <div className="text-zinc-400 font-bold mb-1.5 border-b border-zinc-800 pb-1">{d.date || label}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-zinc-600">Open</span>
        <span className="text-zinc-200 text-right">{formatPrice(d.o)}</span>
        <span className="text-zinc-600">High</span>
        <span className="text-emerald-400 text-right">{formatPrice(d.h)}</span>
        <span className="text-zinc-600">Low</span>
        <span className="text-rose-400 text-right">{formatPrice(d.l)}</span>
        <span className="text-zinc-600">Close</span>
        <span className={`text-right font-black ${isGreen ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPrice(d.c)}</span>
        <span className="text-zinc-600">Volume</span>
        <span className="text-zinc-300 text-right">{formatVolume(d.v)}</span>
      </div>
    </div>
  );
};

interface StockChartProps {
  symbol: string;
  showVolume?: boolean;
  height?: number;
}

export function StockChart({ symbol, showVolume = true, height = 360 }: StockChartProps) {
  const [period, setPeriod] = useState('1M');
  const [chartStyle, setChartStyle] = useState<'area' | 'candle' | 'bar'>('area');
  const [data, setData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ change: number; changePct: number; high52w: number; low52w: number } | null>(null);

  const fetchChart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/historical?symbol=${encodeURIComponent(symbol)}&period=${period}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');

      const rows: any[] = json.data || [];
      if (rows.length === 0) throw new Error('No data');

      const candles: CandleData[] = rows.map((row: any, i: number) => {
        const dateStr = String(row.date || row.Date || row.CH_TIMESTAMP || '');
        const o = safeFloat(row.open_price || row.OpenPrice || row['Open Price'] || row.Open || row.open || row.CH_OPENING_PRICE || 0);
        const h = safeFloat(row.high_price || row.HighPrice || row['High Price'] || row.High || row.high || row.CH_TRADE_HIGH_PRICE || o);
        const l = safeFloat(row.low_price  || row.LowPrice  || row['Low Price']  || row.Low  || row.low  || row.CH_TRADE_LOW_PRICE  || o);
        const c = safeFloat(row.close_price || row.ClosePrice || row['Close Price'] || row.Close || row.close || row.CH_CLOSING_PRICE || o);
        const v = safeFloat(row.total_traded_quantity || row.TotalTradedQuantity || row['Total Traded Quantity'] || row.Volume || row.volume || row.CH_TOT_TRADED_QTY || 0);
        const isGreen = c >= o;
        return {
          t: `${i}`,
          date: dateStr,
          o, h, l, c, v,
          hl: [l, h] as [number, number],
          oc: [Math.min(o, c), Math.max(o, c)] as [number, number],
          isGreen,
        };
      }).filter(d => d.o > 0 || d.c > 0);

      candles.reverse();
      setData(candles);

      if (candles.length >= 2) {
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const chg = last.c - prev.c;
        const chgPct = prev.c > 0 ? (chg / prev.c) * 100 : 0;
        const allHighs = candles.map(d => d.h);
        const allLows  = candles.map(d => d.l);
        setStats({
          change: chg,
          changePct: chgPct,
          high52w: Math.max(...allHighs),
          low52w: Math.min(...allLows),
        });
      }
    } catch (err: any) {
      setError(err.message || 'Chart unavailable');
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

  useEffect(() => {
    fetchChart();
    const id = setInterval(fetchChart, period === '1W' ? 60_000 : 300_000);
    return () => clearInterval(id);
  }, [fetchChart]);

  const isPositive = stats ? stats.change >= 0 : true;
  const gradientColor = isPositive ? '#10b981' : '#ef4444';
  const chartColor   = isPositive ? '#34d399' : '#f87171';

  const areaData = data.map(d => ({ ...d, close: d.c }));

  return (
    <Card className="bg-terminal-card border-zinc-850 overflow-hidden">
      <CardHeader className="pb-2 border-b border-zinc-850">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              {symbol}
            </CardTitle>
            {stats && (
              <span className={`text-xs font-black font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? '+' : ''}{stats.change.toFixed(2)} ({formatPercent(stats.changePct)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Chart Type Selector */}
            <div className="flex rounded overflow-hidden border border-zinc-850 text-[8px] font-mono mr-1.5">
              {(['area', 'candle', 'bar'] as const).map(style => (
                <button
                  key={style}
                  onClick={() => setChartStyle(style)}
                  className={`px-1.5 py-0.5 transition-all uppercase ${
                    chartStyle === style
                      ? 'bg-blue-600/30 text-blue-300 font-bold'
                      : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>

            <div className="flex rounded overflow-hidden border border-zinc-850 text-[8px] font-mono">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-1.5 py-0.5 transition-all ${
                    period === p.value
                      ? 'bg-blue-600/30 text-blue-300 font-bold'
                      : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={fetchChart}
              className="text-zinc-600 hover:text-zinc-300 transition-all hover:rotate-180 duration-500 ml-1"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {stats && (
          <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono">
            <div className="flex items-center gap-1 text-zinc-600">
              <span>52W H:</span>
              <span className="text-emerald-500 font-bold">{formatPrice(stats.high52w)}</span>
            </div>
            <div className="flex items-center gap-1 text-zinc-600">
              <span>52W L:</span>
              <span className="text-rose-500 font-bold">{formatPrice(stats.low52w)}</span>
            </div>
            <Badge variant="outline" className="text-[8px] font-mono border-zinc-700 text-zinc-500 px-1 py-0">
              {data.length} bars
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 w-full">
        <div style={{ height, width: '100%' }} className="relative w-full min-w-0">
          {loading && data.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-10 gap-2">
              <div className="w-6 h-6 border-2 border-zinc-700 border-t-blue-400 rounded-full animate-spin" />
              <span className="text-[10px] text-zinc-600 font-mono">Loading {symbol} chart...</span>
            </div>
          )}
          {!loading && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-2">
              <Activity className="h-6 w-6 opacity-20" />
              <p className="text-xs text-zinc-600 font-mono">Chart data unavailable</p>
              <p className="text-[9px] text-zinc-700">{error}</p>
              <button
                onClick={fetchChart}
                className="text-[9px] text-blue-500 hover:text-blue-300 flex items-center gap-1 font-mono"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          )}
          {!loading && !error && data.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-1.5">
              <Activity className="h-6 w-6 opacity-20" />
              <p className="text-xs font-mono">No historical data available</p>
            </div>
          )}
          {areaData.length > 0 && (
            <ResponsiveContainer width="100%" height={showVolume ? height * 0.75 : height} minWidth={0}>
              {chartStyle === 'area' ? (
                <AreaChart data={areaData} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`chartGrad_${symbol}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="2%"   stopColor={gradientColor} stopOpacity={0.25} />
                      <stop offset="95%"  stopColor={gradientColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="rgba(39,39,42,0.35)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 8, fill: '#52525b', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.floor(areaData.length / 5)}
                    tickFormatter={v => String(v).slice(0, 10)}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 8, fill: '#52525b', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(2)}
                    width={45}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke={chartColor}
                    strokeWidth={1.5}
                    fill={`url(#chartGrad_${symbol})`}
                    dot={false}
                    isAnimationActive
                    animationDuration={600}
                  />
                </AreaChart>
              ) : chartStyle === 'bar' ? (
                <ComposedChart data={areaData} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke="rgba(39,39,42,0.35)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 8, fill: '#52525b', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.floor(areaData.length / 5)}
                    tickFormatter={v => String(v).slice(0, 10)}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 8, fill: '#52525b', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(2)}
                    width={45}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="close" maxBarSize={6}>
                    {areaData.map((entry, index) => {
                      const isUp = entry.c >= entry.o;
                      return <Cell key={`cell-${index}`} fill={isUp ? '#10b981' : '#ef4444'} />;
                    })}
                  </Bar>
                </ComposedChart>
              ) : (
                <ComposedChart data={data} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke="rgba(39,39,42,0.35)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 8, fill: '#52525b', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.floor(data.length / 5)}
                    tickFormatter={v => String(v).slice(0, 10)}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 8, fill: '#52525b', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(2)}
                    width={45}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {/* Candle Wick line */}
                  <Line dataKey="h" stroke="#52525b" strokeWidth={1} dot={false} activeDot={false} />
                  {/* Body candles */}
                  <Bar dataKey="oc" maxBarSize={6}>
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isGreen ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </ComposedChart>
              )}
            </ResponsiveContainer>
          )}

          {showVolume && areaData.length > 0 && (
            <div style={{ height: height * 0.22, marginTop: -4 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ComposedChart data={areaData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis
                    tick={{ fontSize: 7, fill: '#3f3f46', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => formatVolume(v)}
                    width={45}
                  />
                  <Bar
                    dataKey="v"
                    name="Volume"
                    radius={[1, 1, 0, 0]}
                    fill="rgba(59,130,246,0.3)"
                    maxBarSize={4}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
