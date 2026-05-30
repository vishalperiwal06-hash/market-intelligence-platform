'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, TrendingDown, Zap, Clock, ShieldAlert } from 'lucide-react';

import { BrainCircuit } from 'lucide-react';

interface Signal {
  id: string;
  symbol: string;
  signalType: string;
  signalName: string;
  direction: 'bullish' | 'bearish';
  timeframe: string;
  confidence: number;
  priceAtDetection: number;
  timestamp: string;
  aiExplanation?: string;
  aiLoading?: boolean;
}

/**
 * Live Signal Feed Component
 * 
 * Displays the latest market events detected by the Scanner Engine.
 */
export function SignalFeed({ limit = 20, showViewMore = false }: { limit?: number, showViewMore?: boolean }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch(`/api/signals?limit=${limit}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setSignals(json.signals || []);
    } catch {
      // Degrade gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleAIExplanation = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);

    const sigIndex = signals.findIndex(s => s.id === id);
    if (sigIndex === -1 || signals[sigIndex].aiExplanation) return;

    setSignals(prev => {
      const copy = [...prev];
      copy[sigIndex].aiLoading = true;
      return copy;
    });

    try {
      const res = await fetch(`/api/ai/signals/${id}`);
      if (res.ok) {
        const json = await res.json();
        setSignals(prev => {
          const copy = [...prev];
          const idx = copy.findIndex(s => s.id === id);
          if (idx !== -1) {
            copy[idx].aiExplanation = json.analysis?.explanation;
            copy[idx].aiLoading = false;
          }
          return copy;
        });
      }
    } catch {
      // Revert loading
      setSignals(prev => {
        const copy = [...prev];
        const idx = copy.findIndex(s => s.id === id);
        if (idx !== -1) copy[idx].aiLoading = false;
        return copy;
      });
    }
  };

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 15_000); // Poll every 15s
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const getTimeAgo = (ts: string) => {
    const diffMs = Date.now() - new Date(ts).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 flex flex-col h-full">
      <CardHeader className="pb-3 border-b border-zinc-800 shrink-0 flex flex-row items-center justify-between">
        <div className="flex justify-between items-center flex-1">
          <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Live Market Signals
          </CardTitle>
          {showViewMore && (
            <Link href="/signals" className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase font-mono mr-4">
              View All →
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] text-zinc-500 font-mono uppercase">Scanning</span>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-y-auto min-h-[300px] flex-1">
        {loading && signals.length === 0 ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3">
                <div className="h-10 w-10 bg-zinc-800 rounded animate-pulse shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-1/3 bg-zinc-800 rounded animate-pulse" />
                  <div className="h-3 w-2/3 bg-zinc-800 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-zinc-500">
            <ShieldAlert className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No active signals</p>
            <p className="text-xs text-zinc-600 mt-1 text-center max-w-[200px]">
              Scanner engine waiting for genuine setups to trigger.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {signals.map((sig, idx) => {
              const isBull = sig.direction === 'bullish';
              const isExpanded = expandedId === sig.id;
              
              return (
                <div key={`${sig.id}-${idx}`} className="p-3 hover:bg-zinc-800/20 transition-colors group cursor-pointer" onClick={() => toggleAIExplanation(sig.id)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md ${isBull ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {isBull ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-zinc-200 text-sm">{sig.symbol}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-zinc-950 border-zinc-800 text-zinc-400 font-mono">
                            {sig.timeframe}
                          </Badge>
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">{sig.signalName}</div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <div className="text-xs font-mono text-zinc-300">₹{sig.priceAtDetection.toFixed(2)}</div>
                      <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-500">
                        <Clock className="h-3 w-3" />
                        {getTimeAgo(sig.timestamp)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Confidence Bar */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="text-[10px] text-zinc-500 w-8">Conf.</div>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded overflow-hidden">
                      <div 
                        className={`h-full ${sig.confidence > 80 ? 'bg-blue-500' : sig.confidence > 60 ? 'bg-blue-400' : 'bg-blue-300/50'}`} 
                        style={{ width: `${sig.confidence}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400 w-6 text-right">{sig.confidence}%</div>
                    <BrainCircuit className={`h-3.5 w-3.5 ${sig.confidence > 60 ? 'text-purple-400' : 'text-zinc-600'} transition-colors ml-1`} />
                  </div>

                  {/* AI Explanation Expansion */}
                  {isExpanded && (
                    <div className="mt-3 p-3 bg-zinc-900/80 rounded-md border border-purple-500/20 shadow-inner">
                      {sig.aiLoading ? (
                        <div className="flex items-center gap-2 text-xs text-purple-400/70 animate-pulse">
                          <BrainCircuit className="h-3.5 w-3.5" />
                          DeepSeek Reasoning...
                        </div>
                      ) : sig.aiExplanation ? (
                        <div className="space-y-2">
                          {sig.aiExplanation.split('\n\n').map((p, i) => (
                            <p key={i} className="text-xs text-zinc-300 leading-relaxed">{p}</p>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500 italic">No AI explanation available for this setup yet.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
