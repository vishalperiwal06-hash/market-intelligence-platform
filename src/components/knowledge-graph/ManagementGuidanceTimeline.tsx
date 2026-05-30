'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

interface GuidanceItem {
  period: string;
  guidanceType: string;
  guidanceText: string;
  quantifiedValue?: number | null;
  unit?: string | null;
  sentiment: string;
  managementTone: number;
  sourceExcerpt: string;
  wasDelivered?: boolean | null;
  issuedAt: string;
}

const SENTIMENT_CONFIG: Record<string, { color: string; label: string; icon: React.ElementType }> = {
  POSITIVE: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'Positive', icon: TrendingUp },
  NEUTRAL: { color: 'text-zinc-400 bg-zinc-800 border-zinc-700', label: 'Neutral', icon: Minus },
  CAUTIOUS: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', label: 'Cautious', icon: AlertCircle },
  NEGATIVE: { color: 'text-rose-400 bg-rose-500/10 border-rose-500/30', label: 'Negative', icon: TrendingDown },
};

const GUIDANCE_TYPE_COLORS: Record<string, string> = {
  REVENUE: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  MARGIN: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  CAPEX: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  VOLUME: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  EBITDA: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  CUSTOM: 'border-zinc-600 bg-zinc-800 text-zinc-300',
};

interface Props {
  symbol: string;
  guidanceType?: string;
}

export function ManagementGuidanceTimeline({ symbol, guidanceType }: Props) {
  const [items, setItems] = useState<GuidanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let url = `/api/knowledge-graph/guidance?symbol=${symbol}`;
        if (guidanceType) url += `&type=${guidanceType}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setItems(json.guidance || []);
        }
      } catch { /* graceful */ }
      finally { setLoading(false); }
    };
    fetchData();
  }, [symbol, guidanceType]);

  const DeliveryIcon = ({ wasDelivered }: { wasDelivered?: boolean | null }) => {
    if (wasDelivered === true) return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
    if (wasDelivered === false) return <AlertCircle className="h-3 w-3 text-rose-400" />;
    return <HelpCircle className="h-3 w-3 text-zinc-600" />;
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <History className="h-4 w-4 text-amber-400" />
          Management Guidance History
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-zinc-950 border-zinc-700 text-zinc-300 font-mono">
            {symbol}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-800/60 rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-sm">
            No guidance records extracted yet for {symbol}.
          </div>
        ) : (
          <div className="relative">
            {/* Timeline vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-zinc-800" />

            <div className="py-2 space-y-0">
              {items.map((item, i) => {
                const sentiment = SENTIMENT_CONFIG[item.sentiment] || SENTIMENT_CONFIG.NEUTRAL;
                const SentimentIcon = sentiment.icon;
                const typeColor = GUIDANCE_TYPE_COLORS[item.guidanceType] || GUIDANCE_TYPE_COLORS.CUSTOM;
                const isExpanded = expanded === i;

                return (
                  <div key={i} className="relative flex gap-4 px-4 py-2.5 hover:bg-zinc-800/20 transition-colors">
                    {/* Timeline dot */}
                    <div className="relative z-10 flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-zinc-950 border-2 border-zinc-700 flex items-center justify-center">
                      <SentimentIcon className="h-2.5 w-2.5 text-zinc-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center flex-wrap gap-1.5 mb-1">
                        <span className="text-[10px] font-mono text-zinc-500">{item.period}</span>
                        <Badge variant="outline" className={`text-[8px] h-3.5 px-1 border font-mono ${typeColor}`}>
                          {item.guidanceType}
                        </Badge>
                        <Badge variant="outline" className={`text-[8px] h-3.5 px-1 border ${sentiment.color}`}>
                          {sentiment.label}
                        </Badge>
                        <div className="ml-auto flex items-center gap-1.5">
                          <DeliveryIcon wasDelivered={item.wasDelivered} />
                          {item.quantifiedValue != null && (
                            <span className="text-[10px] font-mono text-zinc-300">
                              {item.quantifiedValue}{item.unit || ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Guidance text */}
                      <p
                        className={`text-xs text-zinc-300 leading-relaxed cursor-pointer ${isExpanded ? '' : 'line-clamp-2'}`}
                        onClick={() => setExpanded(isExpanded ? null : i)}
                      >
                        {item.guidanceText}
                      </p>

                      {/* Source excerpt on expand */}
                      {isExpanded && item.sourceExcerpt && (
                        <div className="mt-2 p-2 bg-zinc-950/80 rounded border border-zinc-800">
                          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Source</p>
                          <p className="text-[10px] text-zinc-400 italic leading-relaxed">&ldquo;{item.sourceExcerpt}&rdquo;</p>
                        </div>
                      )}

                      {/* Tone bar */}
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[9px] text-zinc-600">Tone</span>
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${item.managementTone >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            style={{
                              width: `${Math.abs(item.managementTone) * 50}%`,
                              marginLeft: item.managementTone >= 0 ? '50%' : `${50 - Math.abs(item.managementTone) * 50}%`,
                            }}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-zinc-600">
                          {item.managementTone > 0 ? '+' : ''}{item.managementTone.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
