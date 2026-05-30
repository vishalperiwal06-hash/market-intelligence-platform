'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, ShieldCheck, Activity, BarChart3, TrendingUp, Layers, Zap, Crosshair } from 'lucide-react';

interface MarketContext {
  regime: {
    type: string;
    confidence: number;
    factors: string[];
    durationDays: number;
  };
  breadth: {
    advances: number;
    declines: number;
    newHighs: number;
    newLows: number;
    thrustSignal: boolean;
  };
  sectors: {
    leading: string[];
    weakening: string[];
  };
  liquidity: {
    turnoverTrend: string;
    institutionalAccumulationScore: number;
  };
  volatility: {
    realized: number;
    impliedProxy: number;
    rallyQuality: string;
  };
  leadership: {
    trueLeaders: string[];
    stealthAccumulation: string[];
  };
  generatedAt: string;
}

export function MarketContextDashboard() {
  const [context, setContext] = useState<MarketContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContext = async () => {
      try {
        const res = await fetch('/api/market-context');
        if (res.ok) {
          const data = await res.json();
          setContext(data.context);
        }
      } catch (error) {
        console.error('Failed to fetch market context:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchContext();
    const interval = setInterval(fetchContext, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Card key={i} className="bg-zinc-900/50 border-zinc-800 h-48" />
        ))}
      </div>
    );
  }

  if (!context) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Market context data unavailable.</p>
        <p className="text-xs mt-2">Check backend ingestion processes.</p>
      </div>
    );
  }

  const isRiskOn = context.regime.type === 'RISK_ON' || context.regime.type === 'ACCUMULATION' || context.regime.type === 'MOMENTUM_EXPANSION';
  const RegimeIcon = isRiskOn ? ShieldCheck : ShieldAlert;
  const regimeColor = isRiskOn ? 'text-emerald-400' : 'text-rose-400';
  const adRatio = context.breadth.declines > 0 ? (context.breadth.advances / context.breadth.declines).toFixed(2) : context.breadth.advances;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      
      {/* REGIME CARD */}
      <Card className="bg-zinc-900/80 border-zinc-800 shadow-xl overflow-hidden relative">
        <div className={`absolute top-0 left-0 w-1 h-full ${isRiskOn ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <RegimeIcon className={`h-5 w-5 ${regimeColor}`} />
              Market Regime
            </div>
            <Badge variant="outline" className={`font-mono bg-zinc-950 ${isRiskOn ? 'border-emerald-500/30 text-emerald-400' : 'border-rose-500/30 text-rose-400'}`}>
              {(context.regime.confidence * 100).toFixed(0)}% CONF
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black text-white mb-4 tracking-tight">
            {context.regime.type.replace('_', ' ')}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Primary Drivers</p>
            <div className="flex flex-wrap gap-2">
              {context.regime.factors.map(f => (
                <Badge key={f} variant="secondary" className="bg-zinc-800/50 text-zinc-300 text-[10px] hover:bg-zinc-800">
                  {f}
                </Badge>
              ))}
              {context.regime.factors.length === 0 && <span className="text-xs text-zinc-600 italic">No strong factors</span>}
            </div>
            <p className="text-xs text-zinc-500 mt-3 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Active for {context.regime.durationDays} days
            </p>
          </div>
        </CardContent>
      </Card>

      {/* BREADTH CARD */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2 border-b border-zinc-800/50">
          <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            Participation Breadth
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">A/D Ratio</p>
            <div className="flex items-end gap-2">
              <span className={`text-xl font-bold ${Number(adRatio) >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {adRatio}
              </span>
              <span className="text-xs text-zinc-600 mb-1">
                ({context.breadth.advances} / {context.breadth.declines})
              </span>
            </div>
            {context.breadth.thrustSignal && (
              <Badge className="mt-2 bg-blue-500/20 text-blue-300 border-blue-500/40 text-[9px]">THRUST DETECTED</Badge>
            )}
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">52W Highs/Lows</p>
            <div className="flex items-center gap-3">
              <div className="text-emerald-400 font-mono text-sm">{context.breadth.newHighs} H</div>
              <div className="text-rose-400 font-mono text-sm">{context.breadth.newLows} L</div>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 mt-2 rounded-full overflow-hidden flex">
               <div className="bg-emerald-500" style={{ width: `${(context.breadth.newHighs / Math.max(context.breadth.newHighs + context.breadth.newLows, 1)) * 100}%` }} />
               <div className="bg-rose-500 flex-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTOR ROTATION */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2 border-b border-zinc-800/50">
          <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" />
            Sector Rotation
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-semibold mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-400" /> Leading Segments
            </p>
            <div className="flex flex-wrap gap-2">
              {context.sectors.leading.map(s => (
                <Badge key={s} variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-[10px]">
                  {s}
                </Badge>
              ))}
              {context.sectors.leading.length === 0 && <span className="text-xs text-zinc-600">None</span>}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-semibold mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-rose-400 rotate-180" /> Weakening Segments
            </p>
            <div className="flex flex-wrap gap-2">
              {context.sectors.weakening.map(s => (
                <Badge key={s} variant="outline" className="bg-rose-500/10 border-rose-500/30 text-rose-300 text-[10px]">
                  {s}
                </Badge>
              ))}
              {context.sectors.weakening.length === 0 && <span className="text-xs text-zinc-600">None</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LIQUIDITY & VOLATILITY */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2 border-b border-zinc-800/50">
          <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Liquidity & Volatility
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-2 gap-4">
          <div className="space-y-3">
             <div>
               <p className="text-xs text-zinc-500 mb-1">Turnover Trend</p>
               <span className={`text-sm font-semibold ${context.liquidity.turnoverTrend === 'EXPANDING' ? 'text-emerald-400' : context.liquidity.turnoverTrend === 'CONTRACTING' ? 'text-rose-400' : 'text-zinc-300'}`}>
                 {context.liquidity.turnoverTrend}
               </span>
             </div>
             <div>
               <p className="text-xs text-zinc-500 mb-1">Inst. Accumulation</p>
               <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${context.liquidity.institutionalAccumulationScore * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">{(context.liquidity.institutionalAccumulationScore * 100).toFixed(0)}%</span>
               </div>
             </div>
          </div>
          <div className="space-y-3 border-l border-zinc-800/50 pl-4">
             <div>
               <p className="text-xs text-zinc-500 mb-1">Realized Vol (20d)</p>
               <span className="text-sm font-mono text-zinc-200">{context.volatility.realized.toFixed(2)}%</span>
             </div>
             <div>
               <p className="text-xs text-zinc-500 mb-1">Rally Quality</p>
               <Badge variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-300">
                 {context.volatility.rallyQuality}
               </Badge>
             </div>
          </div>
        </CardContent>
      </Card>

      {/* LEADERSHIP */}
      <Card className="bg-zinc-900/50 border-zinc-800 md:col-span-2 xl:col-span-2">
        <CardHeader className="pb-2 border-b border-zinc-800/50">
          <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-cyan-400" />
            Market Leadership & Stealth
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
           <div>
             <p className="text-xs text-zinc-500 uppercase font-semibold mb-3">True Leaders</p>
             <div className="flex flex-wrap gap-2">
                {context.leadership.trueLeaders.map(sym => (
                  <Badge key={sym} variant="outline" className="bg-cyan-500/10 border-cyan-500/30 text-cyan-300 font-mono text-xs py-1">
                    {sym}
                  </Badge>
                ))}
                {context.leadership.trueLeaders.length === 0 && <span className="text-sm text-zinc-600">No true leaders identified.</span>}
             </div>
           </div>
           <div>
             <p className="text-xs text-zinc-500 uppercase font-semibold mb-3">Stealth Accumulation</p>
             <div className="flex flex-wrap gap-2">
                {context.leadership.stealthAccumulation.map(sym => (
                  <Badge key={sym} variant="outline" className="bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300 font-mono text-xs py-1">
                    {sym}
                  </Badge>
                ))}
                {context.leadership.stealthAccumulation.length === 0 && <span className="text-sm text-zinc-600">No stealth accumulation detected.</span>}
             </div>
           </div>
        </CardContent>
      </Card>

    </div>
  );
}
