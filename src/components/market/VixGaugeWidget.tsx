'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Activity, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { safeFloat } from '@/lib/formatters';

interface VixDataPoint {
  date: string;
  vix: number;
  label?: string;
}

function getVixZone(vix: number): { label: string; color: string; bg: string; border: string } {
  if (vix < 12)  return { label: 'EXTREME CALM',    color: '#60a5fa', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)' };
  if (vix < 16)  return { label: 'CALM',            color: '#34d399', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)' };
  if (vix < 20)  return { label: 'NORMAL',          color: '#a3e635', bg: 'rgba(163,230,53,0.08)', border: 'rgba(163,230,53,0.3)' };
  if (vix < 25)  return { label: 'ELEVATED',        color: '#facc15', bg: 'rgba(250,204,21,0.08)', border: 'rgba(250,204,21,0.3)' };
  if (vix < 30)  return { label: 'HIGH FEAR',       color: '#fb923c', bg: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.3)' };
  if (vix < 40)  return { label: 'EXTREME FEAR',    color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)' };
  return                { label: 'PANIC ZONE',      color: '#e879f9', bg: 'rgba(232,121,249,0.08)', border: 'rgba(232,121,249,0.3)' };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const v = safeFloat(payload[0]?.value);
  const zone = getVixZone(v);
  return (
    <div className="bg-zinc-950/95 border border-zinc-800 rounded px-2.5 py-1.5 text-[9px] font-mono shadow-xl">
      <div className="text-zinc-400 mb-0.5">{label}</div>
      <div style={{ color: zone.color }} className="font-black text-sm">{v.toFixed(2)}</div>
      <div style={{ color: zone.color }} className="font-bold uppercase tracking-widest opacity-80">{zone.label}</div>
    </div>
  );
};

export function VixGaugeWidget() {
  const [history, setHistory] = useState<VixDataPoint[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [change, setChange] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchVix = useCallback(async () => {
    try {
      // Try fetching India VIX from our backend
      const res = await fetch('/api/market/vix');
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
          const sorted = [...json.data].sort((a: any, b: any) => {
            const da = new Date(a.date || a.Date || '').getTime();
            const db = new Date(b.date || b.Date || '').getTime();
            return da - db;
          });
          const mapped: VixDataPoint[] = sorted.map((row: any) => ({
            date: String(row.date || row.Date || '').slice(0, 10),
            vix: safeFloat(row.close || row.Close || row.vix || row.VIX || 0),
          })).filter(d => d.vix > 0);
          setHistory(mapped.slice(-30)); // last 30 days
          const last = mapped[mapped.length - 1];
          const prev = mapped[mapped.length - 2];
          setCurrent(last?.vix ?? null);
          setChange(last && prev ? last.vix - prev.vix : 0);
          return;
        }
      }
      // Fallback: try indices endpoint
      const idxRes = await fetch('/api/market/indices');
      if (idxRes.ok) {
        const json = await idxRes.json();
        if (json.ok && Array.isArray(json.data)) {
          const vixRow = json.data.find((d: any) =>
            String(d.symbol || '').toUpperCase().includes('VIX') ||
            String(d.symbol || '').toUpperCase().includes('INDIA VIX')
          );
          if (vixRow) {
            setCurrent(safeFloat(vixRow.price));
            setChange(safeFloat(vixRow.change));
          }
        }
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVix();
    const id = setInterval(fetchVix, 60_000);
    return () => clearInterval(id);
  }, [fetchVix]);

  const zone = current !== null ? getVixZone(current) : null;
  const isUp = change >= 0;

  // Gauge arc rendering via SVG
  const gaugeValue = Math.min(1, Math.max(0, ((current ?? 15) - 8) / 50));
  const gaugeDeg = gaugeValue * 180;
  const r = 52;
  const cx = 70;
  const cy = 72;
  const arcStart = { x: cx - r, y: cy };
  const arcEnd = {
    x: cx + r * Math.cos((Math.PI * (gaugeDeg - 180)) / 180),
    y: cy + r * Math.sin((Math.PI * (gaugeDeg - 180)) / 180),
  };
  const needleX = cx + (r - 8) * Math.cos((Math.PI * (gaugeDeg - 180)) / 180);
  const needleY = cy + (r - 8) * Math.sin((Math.PI * (gaugeDeg - 180)) / 180);

  return (
    <Card className="bg-terminal-card border-zinc-850 overflow-hidden">
      <CardHeader className="pb-2 border-b border-zinc-850">
        <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          India VIX — Fear Gauge
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {loading && current === null ? (
          <div className="h-[160px] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* SVG Gauge */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative shrink-0">
                <svg width="140" height="80" className="overflow-visible">
                  {/* Background arc */}
                  <path
                    d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                    fill="none"
                    stroke="rgba(39,39,42,0.8)"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                  {/* Color zones */}
                  {[
                    { from: 0,   to: 0.2,  color: '#60a5fa' },
                    { from: 0.2, to: 0.4,  color: '#34d399' },
                    { from: 0.4, to: 0.55, color: '#a3e635' },
                    { from: 0.55,to: 0.7,  color: '#facc15' },
                    { from: 0.7, to: 0.85, color: '#fb923c' },
                    { from: 0.85,to: 1,    color: '#f87171' },
                  ].map((seg, i) => {
                    const startDeg = seg.from * 180 - 180;
                    const endDeg = seg.to * 180 - 180;
                    const sx = cx + r * Math.cos((startDeg * Math.PI) / 180);
                    const sy = cy + r * Math.sin((startDeg * Math.PI) / 180);
                    const ex = cx + r * Math.cos((endDeg * Math.PI) / 180);
                    const ey = cy + r * Math.sin((endDeg * Math.PI) / 180);
                    return (
                      <path
                        key={i}
                        d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="10"
                        strokeLinecap="butt"
                        opacity="0.4"
                      />
                    );
                  })}
                  {/* Active arc */}
                  {current !== null && (
                    <path
                      d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${gaugeDeg > 90 ? 1 : 0} 1 ${arcEnd.x} ${arcEnd.y}`}
                      fill="none"
                      stroke={zone?.color || '#71717a'}
                      strokeWidth="10"
                      strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 4px ${zone?.color || '#fff'}50)` }}
                    />
                  )}
                  {/* Needle */}
                  {current !== null && (
                    <>
                      <line
                        x1={cx}
                        y1={cy}
                        x2={needleX}
                        y2={needleY}
                        stroke={zone?.color || '#fff'}
                        strokeWidth="2"
                        strokeLinecap="round"
                        style={{ filter: `drop-shadow(0 0 3px ${zone?.color || '#fff'})` }}
                      />
                      <circle cx={cx} cy={cy} r="4" fill={zone?.color || '#fff'} opacity="0.9" />
                    </>
                  )}
                  {/* Labels */}
                  <text x={cx - r - 4} y={cy + 14} fontSize="7" fill="#52525b" textAnchor="middle" fontFamily="monospace">8</text>
                  <text x={cx} y={cy - r - 6} fontSize="7" fill="#52525b" textAnchor="middle" fontFamily="monospace">33</text>
                  <text x={cx + r + 4} y={cy + 14} fontSize="7" fill="#52525b" textAnchor="middle" fontFamily="monospace">58</text>
                </svg>
              </div>

              {/* Current reading */}
              <div className="flex flex-col items-end gap-1">
                {current !== null ? (
                  <>
                    <div className="text-3xl font-black font-mono tracking-tight" style={{ color: zone?.color || '#fff' }}>
                      {current.toFixed(2)}
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-widest font-mono" style={{ color: zone?.color || '#fff' }}>
                      {zone?.label}
                    </div>
                    <div className={`flex items-center gap-1 text-[10px] font-mono font-bold ${isUp ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {isUp ? '+' : ''}{change.toFixed(2)} pts
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-zinc-600 font-mono">No VIX data</div>
                )}
              </div>
            </div>

            {/* Mini sparkline of VIX history */}
            {history.length > 2 && (
              <div className="h-[70px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 4, right: 0, left: -32, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"   stopColor={zone?.color || '#f59e0b'} stopOpacity={0.3} />
                        <stop offset="95%"  stopColor={zone?.color || '#f59e0b'} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(39,39,42,0.4)" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 7, fill: '#52525b', fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={20} stroke="rgba(250,204,21,0.3)" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey="vix"
                      stroke={zone?.color || '#f59e0b'}
                      strokeWidth={1.5}
                      fill="url(#vixGrad)"
                      dot={false}
                      isAnimationActive
                      animationDuration={800}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Fear zones legend */}
            <div className="grid grid-cols-3 gap-1 text-[7px] font-mono">
              {[
                { range: '< 12', label: 'Complacent', color: '#60a5fa' },
                { range: '12-20', label: 'Normal',    color: '#34d399' },
                { range: '20-30', label: 'Elevated',  color: '#facc15' },
                { range: '30-40', label: 'High Fear', color: '#fb923c' },
                { range: '40-50', label: 'Extreme',   color: '#f87171' },
                { range: '50+',   label: 'Panic',     color: '#e879f9' },
              ].map((z, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                  <span className="text-zinc-600">{z.range}</span>
                  <span className="text-zinc-500 font-semibold">{z.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
