'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, Activity, TrendingUp, ShieldAlert, Sparkles } from 'lucide-react';
import { formatPrice, formatPercent, safeFloat, safeInt } from '@/lib/formatters';

interface OptionChainSummary {
  totalCallOi: number;
  totalPutOi: number;
  putCallRatio: number;
  maxPain: number | null;
  supportStrike?: number | null;
  resistanceStrike?: number | null;
  sentiment?: string;
}

interface StrikeRow {
  strike_price?: number;
  "Strike Price"?: number;
  STRIKE?: number;
  CALLS_OI?: number;
  CE_OI?: number;
  call_oi?: number;
  PUTS_OI?: number;
  PE_OI?: number;
  put_oi?: number;
}

interface OptionChainData {
  symbol: string;
  timestamp: string;
  spotPrice?: number;
  summary: OptionChainSummary;
  chain: StrikeRow[];
}

export function OptionChainWidget({ symbol = 'NIFTY' }: { symbol?: string }) {
  const [data, setData] = useState<OptionChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchChain = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/options/chain?symbol=${symbol}`);
        if (!res.ok) {
          throw new Error('Option chain data unavailable from live stream');
        }
        const json = await res.json();
        if (active) {
          setData(json);
          setError(null);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to retrieve option chain');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchChain();
    const interval = setInterval(fetchChain, 30000); // 30s update
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [symbol]);

  if (loading && !data) {
    return (
      <Card className="bg-terminal-card border-zinc-850 h-[280px] animate-pulse">
        <CardHeader className="pb-2 border-b border-zinc-850">
          <div className="h-4 bg-zinc-800 rounded w-1/3"></div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="h-10 bg-zinc-850 rounded"></div>
          <div className="h-20 bg-zinc-850 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data || !data.summary) {
    return (
      <Card className="bg-terminal-card border-zinc-850 h-[280px] flex flex-col justify-center items-center p-6 text-zinc-550 text-center">
        <ShieldAlert className="h-8 w-8 text-rose-500/80 mb-2 animate-bounce" />
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">Derivatives Feed Offline</span>
        <p className="text-[10px] text-zinc-650 mt-1 max-w-xs leading-normal">
          {error || 'No active option contract stream found. Live exchange hours apply.'}
        </p>
      </Card>
    );
  }

  const { totalCallOi, totalPutOi, putCallRatio, maxPain, supportStrike, resistanceStrike, sentiment: apiSentiment } = data.summary;
  
  // Find top 5 strikes by highest total open interest (support/resistance visualization)
  const sortedStrikes = [...data.chain]
    .map(row => {
      const strike = Number(row.strike_price || row["Strike Price"] || row.STRIKE || 0);
      const ceOi = Number(row.CALLS_OI || row.CE_OI || row.call_oi || 0);
      const peOi = Number(row.PUTS_OI || row.PE_OI || row.put_oi || 0);
      return { strike, ceOi, peOi, totalOi: ceOi + peOi };
    })
    .filter(item => item.strike > 0 && item.totalOi > 0)
    .sort((a, b) => b.totalOi - a.totalOi)
    .slice(0, 5)
    .sort((a, b) => a.strike - b.strike);

  // Calculate sentiment
  const finalSentiment = apiSentiment || (putCallRatio > 1.25 ? 'BULLISH' : putCallRatio < 0.75 ? 'BEARISH' : 'NEUTRAL');
  let sentimentClass = 'text-zinc-400 border-zinc-800 bg-zinc-900/40';
  if (finalSentiment === 'BULLISH') {
    sentimentClass = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10 font-bold';
  } else if (finalSentiment === 'BEARISH') {
    sentimentClass = 'text-rose-400 border-rose-500/20 bg-rose-500/10 font-bold';
  }

  return (
    <Card className="bg-terminal-card border-zinc-850 relative overflow-hidden backdrop-blur-sm">
      <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
        <Layers className="h-20 w-20 text-blue-500" />
      </div>

      <CardHeader className="pb-2 border-b border-zinc-850">
        <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono">
            <Activity className="h-4 w-4 text-blue-400 shrink-0" />
            Derivatives Open Interest ({symbol})
          </div>
          <Badge className={`text-[9px] px-1.5 py-0.5 rounded border tracking-wider ${sentimentClass}`}>
            {finalSentiment}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-3.5 space-y-4">
        {/* KPI Panel */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-zinc-950/80 border border-zinc-850 p-2 rounded">
            <span className="text-[9px] text-zinc-500 block uppercase tracking-wider font-semibold">Put/Call Ratio</span>
            <span className="text-sm font-black font-mono text-zinc-200 mt-0.5 block">
              {putCallRatio.toFixed(3)}
            </span>
          </div>
          
          <div className="bg-zinc-950/80 border border-zinc-850 p-2 rounded">
            <span className="text-[9px] text-zinc-500 block uppercase tracking-wider font-semibold">Max Pain Strike</span>
            <span className="text-sm font-black font-mono text-zinc-200 mt-0.5 block">
              {maxPain ? formatPrice(maxPain, '₹') : '--'}
            </span>
          </div>

          <div className="bg-zinc-950/80 border border-zinc-850 p-2 rounded">
            <span className="text-[9px] text-zinc-500 block uppercase tracking-wider font-semibold">Contracts OI</span>
            <span className="text-sm font-black font-mono text-zinc-200 mt-0.5 block">
              {((safeFloat(totalCallOi) + safeFloat(totalPutOi)) / 1000000).toFixed(1)}M
            </span>
          </div>
        </div>

        {/* Spot Price & Support/Resistance Summary */}
        <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold text-zinc-400 bg-zinc-950/30 p-2 rounded border border-zinc-900 font-mono">
          <div>
            Support Peak: <span className="text-emerald-400 font-bold">{supportStrike ? `₹${supportStrike.toLocaleString('en-IN')}` : '--'}</span>
          </div>
          <div className="text-right">
            Resistance Peak: <span className="text-rose-400 font-bold">{resistanceStrike ? `₹${resistanceStrike.toLocaleString('en-IN')}` : '--'}</span>
          </div>
        </div>

        {/* Major Strikes Visualizer */}
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1">
            <span>Calls (Resistance)</span>
            <span className="text-zinc-400">Strike Price</span>
            <span>Puts (Support)</span>
          </div>

          <div className="space-y-1.5 font-mono text-xs">
            {sortedStrikes.length === 0 ? (
              <div className="text-center text-[10px] text-zinc-600 py-4 font-sans font-medium">No open contracts found for this cycle.</div>
            ) : (
              sortedStrikes.map(item => {
                const maxVal = Math.max(...sortedStrikes.map(s => Math.max(s.ceOi, s.peOi, 1)));
                const ceWidth = (item.ceOi / maxVal) * 100;
                const peWidth = (item.peOi / maxVal) * 100;

                const isSupportPeak = item.strike === supportStrike;
                const isResistancePeak = item.strike === resistanceStrike;

                return (
                  <div key={item.strike} className="flex items-center gap-2">
                    {/* CE Bar (Resistance - Left) */}
                    <div className="flex-1 flex justify-end items-center h-4 bg-zinc-950/20 rounded overflow-hidden relative">
                      <div 
                        className={`h-full absolute right-0 transition-all duration-300 ${
                          isResistancePeak ? 'bg-rose-500/50 border-r border-rose-400' : 'bg-rose-500/25'
                        }`}
                        style={{ width: `${ceWidth}%` }}
                      />
                      <span className={`text-[9px] relative z-10 pr-1.5 font-bold ${isResistancePeak ? 'text-rose-300' : 'text-zinc-500'}`}>
                        {(item.ceOi / 1000).toFixed(0)}k
                      </span>
                    </div>

                    {/* Strike Price */}
                    <div className={`w-14 text-center py-0.5 rounded text-[10px] font-extrabold border ${
                      isSupportPeak ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300' : 
                      isResistancePeak ? 'border-rose-500/30 bg-rose-950/20 text-rose-300' : 
                      'border-zinc-800 bg-zinc-850 text-zinc-400'
                    }`}>
                      {item.strike}
                    </div>

                    {/* PE Bar (Support - Right) */}
                    <div className="flex-1 flex justify-start items-center h-4 bg-zinc-950/20 rounded overflow-hidden relative">
                      <div 
                        className={`h-full absolute left-0 transition-all duration-300 ${
                          isSupportPeak ? 'bg-emerald-500/50 border-l border-emerald-400' : 'bg-emerald-500/25'
                        }`}
                        style={{ width: `${peWidth}%` }}
                      />
                      <span className={`text-[9px] relative z-10 pl-1.5 font-bold ${isSupportPeak ? 'text-emerald-300' : 'text-zinc-500'}`}>
                        {(item.peOi / 1000).toFixed(0)}k
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="text-[9px] text-zinc-600 font-semibold flex justify-between border-t border-zinc-900/60 pt-2 font-mono">
          <span>Real-time derivatives options flow</span>
          <span>Last sync: {new Date(data.timestamp).toLocaleTimeString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
