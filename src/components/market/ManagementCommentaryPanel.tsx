'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquareText, ChevronDown, ChevronUp } from 'lucide-react';

interface CommentaryItem {
  id: string;
  symbol: string;
  topic: string;
  commentary: string;
  sentimentScore: number | null;
  sourceTextSnippet: string | null;
  extractedAt: string;
}

export function ManagementCommentaryPanel({ symbol }: { symbol?: string }) {
  const [items, setItems] = useState<CommentaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = symbol
          ? `/api/corporate/commentary?symbol=${symbol}&limit=20`
          : '/api/corporate/commentary?limit=20';
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setItems(json.commentary);
        }
      } catch { /* graceful */ }
      finally { setLoading(false); }
    };
    fetchData();
  }, [symbol]);

  const getTopicColor = (topic: string) => {
    const map: Record<string, string> = {
      'Demand': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      'Capex': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Risks': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      'Margins': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      'Guidance': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    };
    return map[topic] || 'bg-zinc-800 text-zinc-300 border-zinc-700';
  };

  const getSentimentLabel = (score: number | null) => {
    if (score === null || score === undefined) return null;
    if (score > 0.3) return { label: 'Positive', color: 'text-emerald-400' };
    if (score < -0.3) return { label: 'Negative', color: 'text-rose-400' };
    return { label: 'Neutral', color: 'text-zinc-400' };
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-purple-400" />
          Management Commentary
          {symbol && <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-zinc-950 border-zinc-700 text-zinc-300 font-mono">{symbol}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-zinc-800/60 rounded w-1/3" />
                <div className="h-3 bg-zinc-800/60 rounded w-full" />
                <div className="h-3 bg-zinc-800/60 rounded w-5/6" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-sm">
            No management commentary extracted yet.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/40">
            {items.map((item, idx) => {
              const sentiment = getSentimentLabel(item.sentimentScore);
              const uniqueKey = `${item.id}-${item.symbol}-${item.topic}-${idx}`;
              const isExpanded = expandedId === uniqueKey;

              return (
                <div
                  key={uniqueKey}
                  className="p-3 hover:bg-zinc-800/20 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : uniqueKey)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-200 text-sm">{item.symbol}</span>
                      <Badge variant="outline" className={`text-[9px] h-4 px-1.5 font-mono ${getTopicColor(item.topic)}`}>
                        {item.topic}
                      </Badge>
                      {sentiment && (
                        <span className={`text-[10px] font-mono ${sentiment.color}`}>{sentiment.label}</span>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />}
                  </div>

                  <p className={`text-xs text-zinc-400 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                    {item.commentary}
                  </p>

                  {isExpanded && item.sourceTextSnippet && (
                    <div className="mt-2.5 p-2.5 bg-zinc-950/80 rounded border border-zinc-800/60">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Source Quote</p>
                      <p className="text-xs text-zinc-400 italic leading-relaxed">
                        &ldquo;{item.sourceTextSnippet}&rdquo;
                      </p>
                    </div>
                  )}

                  <div className="mt-1.5 text-[10px] text-zinc-600">
                    Extracted {new Date(item.extractedAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
