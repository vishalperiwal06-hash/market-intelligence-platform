'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMarketStore, MarketData } from '@/store/useMarketStore';
import { Wifi, WifiOff, TrendingUp, TrendingDown } from 'lucide-react';
import { safeFloat, formatPrice, formatPercent, formatVolume, formatTurnover } from '@/lib/formatters';
import Link from 'next/link';

export default function MarketPage() {
  const { marketData: liveData, initialize, connected } = useMarketStore();
  const [initialData, setInitialData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    initialize();

    // Fetch initial static quotes
    fetch('/api/market/quotes')
      .then((res) => res.json())
      .then((res) => {
        if (res.ok && res.data) {
          setInitialData(res.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load initial quotes:', err);
        setLoading(false);
      });
  }, [initialize]);

  // Combine initial quotes with live updates efficiently O(N)
  const displayData = useMemo(() => {
    const initialMap = new Map(initialData.map(d => [d.symbol, d]));
    const allSymbols = Array.from(
      new Set([...initialData.map((d) => d.symbol), ...Object.keys(liveData)])
    );

    return allSymbols
      .map((sym) => {
        return liveData[sym] || initialMap.get(sym);
      })
      .filter((item): item is MarketData => !!item);
  }, [initialData, liveData]);

  // Filter displayData based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return displayData;
    const q = searchQuery.toLowerCase().trim();
    return displayData.filter((item) =>
      item.symbol.toLowerCase().includes(q)
    );
  }, [displayData, searchQuery]);

  // Paginated data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  const totalPages = Math.max(Math.ceil(filteredData.length / itemsPerPage), 1);

  // Reset page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Market Data</h1>
          <p className="text-sm text-zinc-400">Comprehensive real-time market overview</p>
        </div>

        {/* Live connection badge */}
        <div className="flex items-center self-start sm:self-auto">
          {connected ? (
            <span className="flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20 font-medium">
              <Wifi className="h-3.5 w-3.5 animate-pulse" /> Live Feed Active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full border border-amber-500/20 font-medium">
              <WifiOff className="h-3.5 w-3.5 animate-pulse" /> Syncing Quotes...
            </span>
          )}
        </div>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-md">
        <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold text-zinc-100">Live Constituents</CardTitle>
            <span className="text-xs text-zinc-500 font-mono">
              Tracked {filteredData.length} of {displayData.length} symbols A-Z
            </span>
          </div>
          
          {/* Search bar inside header */}
          <div className="w-full md:w-72">
            <input
              type="text"
              placeholder="Search symbol (e.g. LAXMI)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-850 hover:border-zinc-700 focus:border-blue-500 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none transition-all font-mono"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm text-left text-zinc-400">
              <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/80 border-b border-zinc-800">
                <tr>
                  <th scope="col" className="px-6 py-3">Symbol</th>
                  <th scope="col" className="px-6 py-3 text-right">LTP (₹)</th>
                  <th scope="col" className="px-6 py-3 text-right">Change</th>
                  <th scope="col" className="px-6 py-3 text-right">Volume</th>
                  <th scope="col" className="px-6 py-3 text-right">Turnover</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="bg-zinc-900/30 border-b border-zinc-800/50 last:border-0">
                      <td className="px-6 py-4"><div className="h-4 w-20 bg-zinc-800 rounded animate-pulse"></div></td>
                      <td className="px-6 py-4"><div className="h-4 w-16 bg-zinc-800 rounded animate-pulse ml-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-4 w-12 bg-zinc-800 rounded animate-pulse ml-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-4 w-24 bg-zinc-800 rounded animate-pulse ml-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-4 w-20 bg-zinc-800 rounded animate-pulse ml-auto"></div></td>
                    </tr>
                  ))
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                      No matching constituents found.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item) => {
                    const changePercent = safeFloat(item.changePercent);
                    const change = safeFloat(item.change);
                    const isPositive = changePercent >= 0;
                    return (
                      <tr
                        key={item.symbol}
                        className="bg-zinc-900/10 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors"
                      >
                        <td className="px-6 py-4 font-semibold text-zinc-100 font-mono tracking-tight">
                          <Link href={`/stocks/${item.symbol.toLowerCase()}`} className="hover:text-blue-400 transition-colors">
                            {item.symbol}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-medium text-zinc-200">
                          {formatPrice(item.price, '')}
                        </td>
                        <td
                          className={`px-6 py-4 text-right font-mono font-medium flex items-center justify-end gap-1 ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="h-3 w-3 inline" />
                          ) : (
                            <TrendingDown className="h-3 w-3 inline" />
                          )}
                          <span>
                            {isPositive ? '+' : ''}
                            {change.toFixed(2)} ({formatPercent(changePercent)})
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-zinc-300">
                          {formatVolume(item.volume)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-zinc-300">
                          {formatTurnover(item.turnover)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-zinc-800/40 text-xs font-mono">
              <span className="text-zinc-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
