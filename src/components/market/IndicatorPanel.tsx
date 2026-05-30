'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, TrendingDown, AlertTriangle, Zap, ChevronRight } from 'lucide-react';

interface Indicators {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  vwap: number | null;
  atr14: number | null;
  volumeSma20: number | null;
  volumeSpike: boolean;
  breakoutDetected: boolean;
  breakoutType: string | null;
  computedAt?: string;
}

interface IndicatorPanelProps {
  symbol: string;
  timeframe?: string;
  currentPrice?: number;
}

/**
 * Technical Indicator Panel
 *
 * Displays precomputed indicators from /api/indicators.
 * Shows graceful empty state when no indicator data exists.
 */
export function IndicatorPanel({ symbol, timeframe = '1d', currentPrice }: IndicatorPanelProps) {
  const [indicators, setIndicators] = useState<Indicators | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>('');

  const fetchIndicators = useCallback(async () => {
    try {
      const res = await fetch(`/api/indicators?symbol=${symbol}&timeframe=${timeframe}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setIndicators(data.indicators);
      setSource(data.source);
    } catch {
      setIndicators(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    fetchIndicators();
    const interval = setInterval(fetchIndicators, 30_000);
    return () => clearInterval(interval);
  }, [fetchIndicators]);

  const fmt = (v: number | null | undefined) =>
    v != null && !isNaN(v) ? v.toFixed(2) : '—';

  const getRSIColor = (rsi: number | null) => {
    if (rsi === null) return 'text-zinc-500';
    if (rsi >= 70) return 'text-rose-400';
    if (rsi <= 30) return 'text-emerald-400';
    return 'text-zinc-300';
  };

  const getRSILabel = (rsi: number | null) => {
    if (rsi === null) return null;
    if (rsi >= 70) return 'Overbought';
    if (rsi <= 30) return 'Oversold';
    return 'Neutral';
  };

  if (loading) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-100">Technical Indicators</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="flex justify-between items-center">
                <div className="h-3 w-16 bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!indicators) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-100">Technical Indicators</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
            <Activity className="h-6 w-6 mb-2 opacity-20" />
            <p className="text-xs">Indicators computed from genuine data only</p>
            <p className="text-xs text-zinc-600 mt-1">Awaiting sufficient candle history...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-2 border-b border-zinc-800">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-400" />
            Technical Indicators
          </CardTitle>
          <span className="text-[10px] text-zinc-600 font-mono">{timeframe.toUpperCase()}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Alerts */}
        <div className="flex flex-wrap gap-1.5">
          {indicators.breakoutDetected && (
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
              <Zap className="h-3 w-3 mr-1" />
              {indicators.breakoutType === 'resistance' ? 'Resistance Breakout' : 'Support Break'}
            </Badge>
          )}
          {indicators.volumeSpike && (
            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">
              Volume Spike (2x+ SMA20)
            </Badge>
          )}
          {getRSILabel(indicators.rsi14) && (
            <Badge className={`text-[10px] ${
              indicators.rsi14! >= 70
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              RSI {getRSILabel(indicators.rsi14)}
            </Badge>
          )}
        </div>

        {/* Moving Averages */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Moving Averages</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'EMA 20', value: indicators.ema20 },
              { label: 'EMA 50', value: indicators.ema50 },
              { label: 'EMA 200', value: indicators.ema200 },
            ].map(ma => (
              <div key={ma.label} className="bg-zinc-950 rounded p-2 border border-zinc-800/50">
                <div className="text-[10px] text-zinc-500">{ma.label}</div>
                <div className="text-xs font-mono text-zinc-200">{fmt(ma.value)}</div>
                {currentPrice != null && ma.value != null && (
                  <div className={`text-[10px] flex items-center gap-0.5 mt-0.5 ${
                    currentPrice > ma.value ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {currentPrice > ma.value
                      ? <TrendingUp className="h-2.5 w-2.5" />
                      : <TrendingDown className="h-2.5 w-2.5" />
                    }
                    {currentPrice > ma.value ? 'Above' : 'Below'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Momentum */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Momentum</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-950 rounded p-2 border border-zinc-800/50">
              <div className="text-[10px] text-zinc-500">RSI (14)</div>
              <div className={`text-xs font-mono ${getRSIColor(indicators.rsi14)}`}>
                {fmt(indicators.rsi14)}
              </div>
              {indicators.rsi14 != null && (
                <div className="mt-1 h-1.5 w-full bg-zinc-800 rounded overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      indicators.rsi14 >= 70 ? 'bg-rose-500' : indicators.rsi14 <= 30 ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, indicators.rsi14)}%` }}
                  />
                </div>
              )}
            </div>
            <div className="bg-zinc-950 rounded p-2 border border-zinc-800/50">
              <div className="text-[10px] text-zinc-500">ATR (14)</div>
              <div className="text-xs font-mono text-zinc-200">{fmt(indicators.atr14)}</div>
            </div>
          </div>
        </div>

        {/* MACD */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">MACD</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-950 rounded p-2 border border-zinc-800/50">
              <div className="text-[10px] text-zinc-500">Line</div>
              <div className="text-xs font-mono text-zinc-200">{fmt(indicators.macdLine)}</div>
            </div>
            <div className="bg-zinc-950 rounded p-2 border border-zinc-800/50">
              <div className="text-[10px] text-zinc-500">Signal</div>
              <div className="text-xs font-mono text-zinc-200">{fmt(indicators.macdSignal)}</div>
            </div>
            <div className="bg-zinc-950 rounded p-2 border border-zinc-800/50">
              <div className="text-[10px] text-zinc-500">Histogram</div>
              <div className={`text-xs font-mono ${
                indicators.macdHistogram != null && indicators.macdHistogram > 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {fmt(indicators.macdHistogram)}
              </div>
            </div>
          </div>
        </div>

        {/* Bollinger Bands */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Bollinger Bands</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-950 rounded p-2 border border-zinc-800/50">
              <div className="text-[10px] text-zinc-500">Upper</div>
              <div className="text-xs font-mono text-zinc-200">{fmt(indicators.bbUpper)}</div>
            </div>
            <div className="bg-zinc-950 rounded p-2 border border-zinc-800/50">
              <div className="text-[10px] text-zinc-500">Middle</div>
              <div className="text-xs font-mono text-zinc-200">{fmt(indicators.bbMiddle)}</div>
            </div>
            <div className="bg-zinc-950 rounded p-2 border border-zinc-800/50">
              <div className="text-[10px] text-zinc-500">Lower</div>
              <div className="text-xs font-mono text-zinc-200">{fmt(indicators.bbLower)}</div>
            </div>
          </div>
        </div>

        {/* VWAP */}
        {indicators.vwap != null && (
          <div className="flex justify-between items-center bg-zinc-950 rounded p-2 border border-zinc-800/50">
            <div className="text-[10px] text-zinc-500">VWAP</div>
            <div className="text-xs font-mono text-zinc-200">{fmt(indicators.vwap)}</div>
          </div>
        )}

        {/* Footer */}
        {indicators.computedAt && (
          <div className="text-[10px] text-zinc-600 text-right font-mono">
            Computed: {new Date(indicators.computedAt).toLocaleTimeString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
