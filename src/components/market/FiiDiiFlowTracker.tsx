'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell } from 'recharts';
import { ShieldAlert, TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight, Landmark, RefreshCw } from 'lucide-react';
import { safeFloat } from '@/lib/formatters';

interface FiiDiiRow {
  category: string;
  date: string;
  buyValue: number;
  sellValue: number;
  netValue: number;
}

export function FiiDiiFlowTracker() {
  const [data, setData] = useState<FiiDiiRow[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chart' | 'table'>('chart');

  const fetchFiiDii = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/market/fii-dii');
      if (!res.ok) {
        throw new Error('Upstream flow engine offline');
      }
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setRawRows(json.data);
        
        // Parse and normalize nselib keys which can be quite dynamic
        const parsed: FiiDiiRow[] = json.data.map((row: any) => {
          const cat = String(row.category || row.Category || row.CATEGORY || '').toUpperCase().trim();
          const dateStr = String(row.date || row.Date || row.DATE || '');
          
          const buy = safeFloat(row.buy_value || row.buyValue || row['Buy Value'] || row['BUY_VALUE'] || 0);
          const sell = safeFloat(row.sell_value || row.sellValue || row['Sell Value'] || row['SELL_VALUE'] || 0);
          const net = safeFloat(row.net_value || row.netValue || row['Net Value'] || row['NET_VALUE'] || (buy - sell));

          return {
            category: cat.includes('DII') ? 'DII' : cat.includes('FII') || cat.includes('FPI') ? 'FII' : cat,
            date: dateStr,
            buyValue: buy,
            sellValue: sell,
            netValue: net
          };
        }).filter((r: FiiDiiRow) => r.category && r.date);

        setData(parsed);
        setError(null);
      } else {
        throw new Error('Invalid flow data structure');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch FII/DII activities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiiDii();
    const interval = setInterval(fetchFiiDii, 120000); // 2 minutes
    return () => clearInterval(interval);
  }, []);

  if (loading && data.length === 0) {
    return (
      <Card className="bg-terminal-card border-zinc-850 h-[380px] animate-pulse">
        <CardHeader className="pb-2 border-b border-zinc-850">
          <div className="h-4 bg-zinc-850 rounded w-1/3"></div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="h-16 bg-zinc-850 rounded"></div>
            <div className="h-16 bg-zinc-850 rounded"></div>
          </div>
          <div className="h-44 bg-zinc-850 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  if (error && data.length === 0) {
    return (
      <Card className="bg-terminal-card border-zinc-850 h-[380px] flex flex-col justify-center items-center p-6 text-zinc-550 text-center">
        <ShieldAlert className="h-8 w-8 text-rose-500/80 mb-2 animate-bounce" />
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">Flow Tracker Offline</span>
        <p className="text-[10px] text-zinc-650 mt-1 max-w-xs leading-normal">
          {error || 'Upstream institutional flow data is currently unavailable. Live exchange hours apply.'}
        </p>
      </Card>
    );
  }

  // Aggregate stats
  const latestDate = data[0]?.date || '--';
  const latestFii = data.find(r => r.category === 'FII' && r.date === latestDate);
  const latestDii = data.find(r => r.category === 'DII' && r.date === latestDate);

  const fiiNet = latestFii?.netValue ?? 0;
  const diiNet = latestDii?.netValue ?? 0;

  // Aggregate chronological flow data for chart
  // Group by date, creating rows with { date, FII: net, DII: net }
  const flowsByDateMap: Record<string, { date: string; FII: number; DII: number }> = {};
  data.forEach(row => {
    if (!flowsByDateMap[row.date]) {
      flowsByDateMap[row.date] = { date: row.date, FII: 0, DII: 0 };
    }
    if (row.category === 'FII') {
      flowsByDateMap[row.date].FII = row.netValue;
    } else if (row.category === 'DII') {
      flowsByDateMap[row.date].DII = row.netValue;
    }
  });

  const chartData = Object.values(flowsByDateMap)
    .sort((a, b) => {
      // Robust date sorting (DD-MM-YYYY or ISO)
      const parseDt = (dStr: string) => {
        const parts = dStr.split('-');
        if (parts.length === 3) {
          // assume DD-MM-YYYY
          return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
        }
        return new Date(dStr).getTime();
      };
      return parseDt(a.date) - parseDt(b.date);
    })
    .slice(-10); // Last 10 reporting days

  return (
    <Card className="bg-terminal-card border-zinc-850 relative overflow-hidden backdrop-blur-sm flex flex-col h-full">
      <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
        <Landmark className="h-24 w-24 text-blue-500" />
      </div>

      <CardHeader className="pb-2 border-b border-zinc-850 shrink-0">
        <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono">
            <Landmark className="h-4 w-4 text-emerald-400 shrink-0" />
            Institutional Market Flows (FII & DII)
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded bg-zinc-950 border border-zinc-850 p-0.5 text-[9px] font-mono">
              <button 
                onClick={() => setActiveTab('chart')}
                className={`px-2 py-0.5 rounded transition-all ${activeTab === 'chart' ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-550 hover:text-zinc-300'}`}
              >
                Chart
              </button>
              <button 
                onClick={() => setActiveTab('table')}
                className={`px-2 py-0.5 rounded transition-all ${activeTab === 'table' ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-550 hover:text-zinc-300'}`}
              >
                Data Grid
              </button>
            </div>
            <button 
              onClick={fetchFiiDii} 
              disabled={loading}
              className="text-zinc-500 hover:text-zinc-300 hover:rotate-180 transition-all duration-500 cursor-pointer disabled:opacity-50"
              title="Refresh Flow Data"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-3.5 flex-1 flex flex-col justify-between space-y-3.5 overflow-hidden min-h-[300px]">
        {/* KPI Panel */}
        <div className="grid grid-cols-2 gap-3 shrink-0">
          {/* FII Widget */}
          <div className="bg-zinc-950/80 border border-zinc-850 p-2.5 rounded-lg flex justify-between items-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-zinc-550 block uppercase tracking-wider font-extrabold font-mono">FII Net Purchases</span>
                <Badge variant="outline" className="text-[8px] bg-blue-950/20 text-blue-400 border-blue-500/25 px-1 py-0 font-mono">FPI</Badge>
              </div>
              <span className={`text-base font-black font-mono mt-1 block tracking-tight ${
                fiiNet > 0 ? 'text-emerald-400' : fiiNet < 0 ? 'text-rose-400' : 'text-zinc-400'
              }`}>
                {fiiNet > 0 ? '+' : ''}{fiiNet.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr
              </span>
            </div>
            <div className={`p-1.5 rounded-lg ${fiiNet >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'} transition-transform group-hover:scale-110`}>
              {fiiNet >= 0 ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-400" />
              ) : (
                <ArrowDownLeft className="h-4 w-4 text-rose-400" />
              )}
            </div>
          </div>

          {/* DII Widget */}
          <div className="bg-zinc-950/80 border border-zinc-850 p-2.5 rounded-lg flex justify-between items-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-purple-500" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-zinc-550 block uppercase tracking-wider font-extrabold font-mono">DII Net Purchases</span>
                <Badge variant="outline" className="text-[8px] bg-purple-950/20 text-purple-400 border-purple-500/25 px-1 py-0 font-mono">DOM</Badge>
              </div>
              <span className={`text-base font-black font-mono mt-1 block tracking-tight ${
                diiNet > 0 ? 'text-emerald-400' : diiNet < 0 ? 'text-rose-400' : 'text-zinc-400'
              }`}>
                {diiNet > 0 ? '+' : ''}{diiNet.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr
              </span>
            </div>
            <div className={`p-1.5 rounded-lg ${diiNet >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'} transition-transform group-hover:scale-110`}>
              {diiNet >= 0 ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-400" />
              ) : (
                <ArrowDownLeft className="h-4 w-4 text-rose-400" />
              )}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 flex flex-col justify-center min-h-[180px] overflow-hidden">
          {activeTab === 'chart' ? (
            <div className="w-full h-full min-h-[180px] font-mono text-[9px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 5, left: -25, bottom: 5 }}
                >
                  <XAxis 
                    dataKey="date" 
                    stroke="#4b5563" 
                    fontSize={8}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#4b5563" 
                    fontSize={8}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => typeof v === 'number' && !isNaN(v) ? `${v.toFixed(0)}` : ''}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(9, 9, 11, 0.95)',
                      borderColor: '#27272a',
                      fontSize: '9px',
                      fontFamily: 'monospace',
                      borderRadius: '6px'
                    }}
                    labelClassName="text-zinc-400 font-bold mb-1"
                  />
                  <ReferenceLine y={0} stroke="#27272a" strokeWidth={1} />
                  <Bar name="FII Flow (Cr)" dataKey="FII" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-fii-${index}`} 
                        fill={entry.FII >= 0 ? 'rgba(59, 130, 246, 0.75)' : 'rgba(239, 68, 68, 0.65)'} 
                      />
                    ))}
                  </Bar>
                  <Bar name="DII Flow (Cr)" dataKey="DII" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-dii-${index}`} 
                        fill={entry.DII >= 0 ? 'rgba(168, 85, 247, 0.75)' : 'rgba(239, 68, 68, 0.35)'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              
              {/* Legend overlay */}
              <div className="absolute bottom-1 right-2 flex items-center gap-3 bg-zinc-950/80 px-2 py-0.5 rounded border border-zinc-850 font-sans text-[8px]">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="text-zinc-400 font-semibold uppercase">FII Flow</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span className="text-zinc-400 font-semibold uppercase">DII Flow</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full overflow-y-auto border border-zinc-900 rounded bg-zinc-950/20 max-h-[190px]">
              <table className="w-full text-left font-mono text-[9px] border-collapse">
                <thead className="sticky top-0 bg-zinc-950/90 border-b border-zinc-850 z-20">
                  <tr>
                    <th className="p-1.5 text-zinc-500 font-bold uppercase tracking-wider">Date</th>
                    <th className="p-1.5 text-zinc-500 font-bold uppercase tracking-wider">FII Net</th>
                    <th className="p-1.5 text-zinc-500 font-bold uppercase tracking-wider text-right">DII Net</th>
                    <th className="p-1.5 text-zinc-500 font-bold uppercase tracking-wider text-right">Combined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/50">
                  {Object.values(flowsByDateMap)
                    .sort((a, b) => {
                      const parseDt = (dStr: string) => {
                        const parts = dStr.split('-');
                        if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
                        return new Date(dStr).getTime();
                      };
                      return parseDt(b.date) - parseDt(a.date); // Reverse chronological
                    })
                    .slice(0, 15) // Top 15 rows
                    .map((item) => {
                      const combined = item.FII + item.DII;
                      return (
                        <tr key={item.date} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="p-1.5 text-zinc-300 font-semibold">{item.date}</td>
                          <td className={`p-1.5 font-bold ${item.FII >= 0 ? 'text-blue-400' : 'text-rose-500/80'}`}>
                            {item.FII >= 0 ? '+' : ''}{item.FII.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                          </td>
                          <td className={`p-1.5 font-bold text-right ${item.DII >= 0 ? 'text-purple-400' : 'text-rose-500/80'}`}>
                            {item.DII >= 0 ? '+' : ''}{item.DII.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                          </td>
                          <td className={`p-1.5 font-black text-right ${combined >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {combined >= 0 ? '+' : ''}{combined.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sync Stamp */}
        <div className="text-[8px] text-zinc-650 font-semibold flex justify-between border-t border-zinc-900/60 pt-2 shrink-0 font-mono">
          <span>Source: NSDL Upstream Calendar Feed</span>
          <span>Reporting date: {latestDate}</span>
        </div>
      </CardContent>
    </Card>
  );
}
