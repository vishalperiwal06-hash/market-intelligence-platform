'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, TrendingUp, Flame, Zap } from 'lucide-react';
import Link from 'next/link';

interface RankingData {
  symbol: string;
  changePercent?: number;
  ratio?: number; // Volume expansion
  rsi14?: number;
}

/**
 * Market Leadership Widget
 * 
 * Displays Top Gainers, Volume Expansion Leaders, and Momentum Leaders
 * powered by the Ranking Engine.
 */
export function LeadershipWidget() {
  const [gainers, setGainers] = useState<RankingData[]>([]);
  const [volumeLeaders, setVolumeLeaders] = useState<RankingData[]>([]);
  const [momentumLeaders, setMomentumLeaders] = useState<RankingData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRankings = useCallback(async () => {
    try {
      const [gainRes, volRes, momRes] = await Promise.all([
        fetch('/api/rankings?type=strongest_stocks'),
        fetch('/api/rankings?type=volume_expansion'),
        fetch('/api/rankings?type=momentum_leaders')
      ]);

      if (gainRes.ok) setGainers((await gainRes.json()).data || []);
      if (volRes.ok) setVolumeLeaders((await volRes.json()).data || []);
      if (momRes.ok) setMomentumLeaders((await momRes.json()).data || []);
    } catch {
      // Degrade gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRankings();
    const interval = setInterval(fetchRankings, 60_000); // Poll every minute
    return () => clearInterval(interval);
  }, [fetchRankings]);

  const renderList = (items: RankingData[], type: 'gainers' | 'volume' | 'momentum') => {
    if (loading && items.length === 0) {
      return (
        <div className="space-y-3 mt-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex justify-between items-center">
              <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />
              <div className="h-4 w-12 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
          <Trophy className="h-6 w-6 mb-2 opacity-20" />
          <p className="text-xs">Awaiting ranking data...</p>
        </div>
      );
    }

    return (
      <div className="space-y-1 mt-2">
        {items.slice(0, 5).map((item, idx) => (
          <Link 
            href={`/stocks/${item.symbol.toLowerCase()}`} 
            key={item.symbol}
            className="flex items-center justify-between p-2 rounded hover:bg-zinc-800/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-zinc-600 font-mono w-3">{idx + 1}</span>
              <span className="text-sm font-semibold text-zinc-200 group-hover:text-blue-400 transition-colors">{item.symbol}</span>
            </div>
            <div className="text-right">
              {type === 'gainers' && (
                <span className="text-sm font-mono text-emerald-400">+{item.changePercent?.toFixed(2)}%</span>
              )}
              {type === 'volume' && (
                <span className="text-sm font-mono text-purple-400">{item.ratio?.toFixed(1)}x Vol</span>
              )}
              {type === 'momentum' && (
                <span className="text-sm font-mono text-amber-400">RSI {item.rsi14?.toFixed(0)}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-2 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          Market Leadership
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <Tabs defaultValue="gainers" className="w-full">
          <TabsList className="bg-zinc-950 border border-zinc-800 p-1 w-full grid grid-cols-3 rounded-md">
            <TabsTrigger value="gainers" className="data-[state=active]:bg-zinc-800 text-[10px] sm:text-xs">
              <TrendingUp className="h-3 w-3 mr-1 text-emerald-400" /> Gainers
            </TabsTrigger>
            <TabsTrigger value="volume" className="data-[state=active]:bg-zinc-800 text-[10px] sm:text-xs">
              <Flame className="h-3 w-3 mr-1 text-purple-400" /> Volume
            </TabsTrigger>
            <TabsTrigger value="momentum" className="data-[state=active]:bg-zinc-800 text-[10px] sm:text-xs">
              <Zap className="h-3 w-3 mr-1 text-amber-400" /> Mom.
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="gainers">
            {renderList(gainers, 'gainers')}
          </TabsContent>
          <TabsContent value="volume">
            {renderList(volumeLeaders, 'volume')}
          </TabsContent>
          <TabsContent value="momentum">
            {renderList(momentumLeaders, 'momentum')}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
