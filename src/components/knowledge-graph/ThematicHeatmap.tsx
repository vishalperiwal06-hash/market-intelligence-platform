'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flame } from 'lucide-react';

interface HeatmapCell {
  theme: string;
  companyCount: number;
  avgConfidence: number;
}

const THEME_COLORS: Record<string, string> = {
  AI:                  'from-violet-600/80 to-violet-800/80 border-violet-500/40',
  DEFENSE:             'from-rose-600/80 to-rose-800/80 border-rose-500/40',
  RAILWAYS:            'from-orange-500/80 to-orange-700/80 border-orange-400/40',
  EV:                  'from-emerald-500/80 to-emerald-700/80 border-emerald-400/40',
  MANUFACTURING:       'from-blue-500/80 to-blue-700/80 border-blue-400/40',
  SEMICONDUCTORS:      'from-cyan-500/80 to-cyan-700/80 border-cyan-400/40',
  LOGISTICS:           'from-amber-500/80 to-amber-700/80 border-amber-400/40',
  ENERGY:              'from-yellow-500/80 to-yellow-700/80 border-yellow-400/40',
  INFRASTRUCTURE:      'from-teal-500/80 to-teal-700/80 border-teal-400/40',
  PLI:                 'from-indigo-500/80 to-indigo-700/80 border-indigo-400/40',
  CHINA_PLUS_ONE:      'from-red-500/80 to-red-700/80 border-red-400/40',
  DATA_CENTERS:        'from-purple-500/80 to-purple-700/80 border-purple-400/40',
  RENEWABLE:           'from-green-500/80 to-green-700/80 border-green-400/40',
  PHARMA:              'from-pink-500/80 to-pink-700/80 border-pink-400/40',
  AGRI:                'from-lime-500/80 to-lime-700/80 border-lime-400/40',
  FINTECH:             'from-sky-500/80 to-sky-700/80 border-sky-400/40',
  EXPORT:              'from-fuchsia-500/80 to-fuchsia-700/80 border-fuchsia-400/40',
  IMPORT_SUBSTITUTION: 'from-zinc-500/80 to-zinc-700/80 border-zinc-400/40',
  REAL_ESTATE:         'from-stone-500/80 to-stone-700/80 border-stone-400/40',
};

interface Props {
  onThemeSelect?: (theme: string) => void;
}

export function ThematicHeatmap({ onThemeSelect }: Props) {
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/knowledge-graph/themes?action=heatmap');
        if (res.ok) {
          const json = await res.json();
          setCells(json.heatmap || []);
        }
      } catch { /* graceful */ }
      finally { setLoading(false); }
    };
    fetchData();
    const interval = setInterval(fetchData, 120_000); // Refresh every 2 min
    return () => clearInterval(interval);
  }, []);

  const handleClick = (theme: string) => {
    setSelectedTheme(theme === selectedTheme ? null : theme);
    onThemeSelect?.(theme);
  };

  const maxCount = Math.max(...cells.map(c => c.companyCount), 1);

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          Thematic Intelligence Heatmap
          <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1.5 bg-zinc-950 border-zinc-700 text-zinc-400">
            Derived from Filings
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="grid grid-cols-4 gap-2 animate-pulse">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-16 bg-zinc-800/60 rounded-lg" />
            ))}
          </div>
        ) : cells.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No thematic data extracted yet.<br />
            <span className="text-zinc-600 text-xs">Themes are derived from actual filing text.</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {cells.map(cell => {
              const colorClass = THEME_COLORS[cell.theme] || 'from-zinc-600/80 to-zinc-800/80 border-zinc-500/40';
              const opacity = 0.4 + (cell.companyCount / maxCount) * 0.6;
              const isSelected = selectedTheme === cell.theme;

              return (
                <button
                  key={cell.theme}
                  onClick={() => handleClick(cell.theme)}
                  className={`
                    relative p-2.5 rounded-lg border bg-gradient-to-br text-left transition-all duration-200
                    ${colorClass}
                    ${isSelected ? 'ring-2 ring-white/40 scale-[1.03]' : 'hover:scale-[1.02] hover:ring-1 hover:ring-white/20'}
                  `}
                  style={{ opacity }}
                >
                  <div className="text-[10px] font-bold text-white leading-tight mb-1 truncate">
                    {cell.theme.replace('_', ' ')}
                  </div>
                  <div className="text-lg font-black text-white">{cell.companyCount}</div>
                  <div className="text-[9px] text-white/60 mt-0.5">
                    {(cell.avgConfidence * 100).toFixed(0)}% conf
                  </div>
                  {cell.companyCount === maxCount && (
                    <div className="absolute top-1 right-1">
                      <Flame className="h-2.5 w-2.5 text-orange-300" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
