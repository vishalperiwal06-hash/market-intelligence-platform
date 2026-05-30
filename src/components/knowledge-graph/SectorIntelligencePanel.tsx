'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ThemeExposure {
  symbol: string;
  theme: string;
  exposureLevel: string;
  confidenceScore: number;
  mentionCount: number;
  evidenceSummary: string;
}

const EXPOSURE_COLORS: Record<string, string> = {
  PRIMARY:    'bg-violet-500/20 text-violet-300 border-violet-500/40',
  SECONDARY:  'bg-blue-500/20 text-blue-300 border-blue-500/40',
  PERIPHERAL: 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

interface Props {
  symbol: string;
}

export function SectorIntelligencePanel({ symbol }: Props) {
  const [themes, setThemes] = useState<ThemeExposure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/knowledge-graph/themes?symbol=${symbol}`);
        if (res.ok) {
          const json = await res.json();
          setThemes(json.themes || []);
        }
      } catch { /* graceful */ }
      finally { setLoading(false); }
    };
    fetchData();
  }, [symbol]);

  const primary = themes.filter(t => t.exposureLevel === 'PRIMARY');
  const secondary = themes.filter(t => t.exposureLevel === 'SECONDARY');
  const peripheral = themes.filter(t => t.exposureLevel === 'PERIPHERAL');

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Network className="h-4 w-4 text-violet-400" />
          Sector Intelligence
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-zinc-950 border-zinc-700 text-zinc-300 font-mono">
            {symbol}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-8 bg-zinc-800/60 rounded" />)}
          </div>
        ) : themes.length === 0 ? (
          <div className="text-center py-4 text-zinc-500 text-sm">
            No thematic exposure detected yet.<br />
            <span className="text-zinc-600 text-xs">Derived from actual filing text.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {[
              { label: 'Primary Themes', items: primary, colorClass: 'text-violet-300' },
              { label: 'Secondary Exposure', items: secondary, colorClass: 'text-blue-300' },
              { label: 'Peripheral', items: peripheral, colorClass: 'text-zinc-400' },
            ].map(group => group.items.length > 0 && (
              <div key={group.label}>
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold mb-2">{group.label}</p>
                <div className="space-y-1.5">
                  {group.items.map((t, i) => (
                    <div key={i} className="p-2.5 bg-zinc-800/30 rounded-lg border border-zinc-800">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${group.colorClass}`}>
                            {t.theme.replace('_', ' ')}
                          </span>
                          <Badge variant="outline" className={`text-[8px] h-3.5 px-1 border ${EXPOSURE_COLORS[t.exposureLevel]}`}>
                            {t.exposureLevel}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono text-zinc-400">
                            {(t.confidenceScore * 100).toFixed(0)}%
                          </span>
                          <span className="text-[9px] text-zinc-600">·{t.mentionCount}x</span>
                        </div>
                      </div>
                      {/* Confidence bar */}
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-blue-500 transition-all"
                          style={{ width: `${t.confidenceScore * 100}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-1.5 line-clamp-2">{t.evidenceSummary}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
