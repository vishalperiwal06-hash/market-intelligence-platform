'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, BarChart3, AlertTriangle } from 'lucide-react';

interface ExtractedFinancial {
  id: string;
  symbol: string;
  period: string;
  revenue: number | null;
  pat: number | null;
  ebitda: number | null;
  operatingMargin: number | null;
  yoyGrowth: number | null;
  qoqGrowth: number | null;
  extractionConfidence: number;
  extractedAt: string;
}

export function ExtractedFinancialsTable({ symbol }: { symbol?: string }) {
  const [data, setData] = useState<ExtractedFinancial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = symbol
          ? `/api/corporate/financials?symbol=${symbol}&limit=10`
          : '/api/corporate/financials?limit=10';
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setData(json.financials);
        }
      } catch { /* graceful */ }
      finally { setLoading(false); }
    };
    fetchData();
  }, [symbol]);

  const formatCr = (v: number | null) => {
    if (v === null || v === undefined) return '—';
    return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
  };

  const formatPct = (v: number | null) => {
    if (v === null || v === undefined) return '—';
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  };

  const GrowthBadge = ({ value }: { value: number | null }) => {
    if (value === null || value === undefined) return <span className="text-zinc-600">—</span>;
    const color = value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-zinc-400';
    const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
    return (
      <span className={`flex items-center gap-1 text-xs font-mono ${color}`}>
        <Icon className="h-3 w-3" />
        {formatPct(value)}
      </span>
    );
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-400" />
          Extracted Financial Metrics
          {symbol && <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-zinc-950 border-zinc-700 text-zinc-300 font-mono">{symbol}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-10 bg-zinc-800/60 rounded" />)}
          </div>
        ) : data.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-sm">
            No extracted financials available yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left font-medium">Symbol</th>
                  <th className="px-3 py-2.5 text-left font-medium">Period</th>
                  <th className="px-3 py-2.5 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2.5 text-right font-medium">PAT</th>
                  <th className="px-3 py-2.5 text-right font-medium">EBITDA</th>
                  <th className="px-3 py-2.5 text-right font-medium">OPM</th>
                  <th className="px-3 py-2.5 text-right font-medium">YoY</th>
                  <th className="px-3 py-2.5 text-right font-medium">QoQ</th>
                  <th className="px-3 py-2.5 text-center font-medium">Conf.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {data.map((row, idx) => (
                  <tr key={`${row.id}-${idx}`} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-zinc-200">{row.symbol}</td>
                    <td className="px-3 py-2.5 text-zinc-400 font-mono">{row.period}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-300 font-mono">{formatCr(row.revenue)}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-300 font-mono">{formatCr(row.pat)}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-300 font-mono">{formatCr(row.ebitda)}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-300 font-mono">{formatPct(row.operatingMargin)}</td>
                    <td className="px-3 py-2.5 text-right"><GrowthBadge value={row.yoyGrowth} /></td>
                    <td className="px-3 py-2.5 text-right"><GrowthBadge value={row.qoqGrowth} /></td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {row.extractionConfidence < 0.5 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                        <span className={`font-mono ${row.extractionConfidence >= 0.8 ? 'text-emerald-400' : row.extractionConfidence >= 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {(row.extractionConfidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
