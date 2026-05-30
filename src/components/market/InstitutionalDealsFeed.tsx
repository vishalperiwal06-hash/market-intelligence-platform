'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Search, ShieldAlert, ArrowUpRight, ArrowDownLeft, Filter, RefreshCw, Zap } from 'lucide-react';
import { safeFloat, safeInt } from '@/lib/formatters';

interface InstitutionalDeal {
  symbol: string;
  securityName: string;
  clientName: string;
  dealType: 'BULK' | 'BLOCK';
  action: 'BUY' | 'SELL' | 'UNKNOWN';
  quantity: number;
  price: number;
  valueCr: number;
  date: string;
}

export function InstitutionalDealsFeed({ limit = 15, showViewMore = false }: { limit?: number, showViewMore?: boolean }) {
  const [deals, setDeals] = useState<InstitutionalDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'BULK' | 'BLOCK'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchDeals = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/market/deals');
      if (!res.ok) {
        throw new Error('Institutional deal stream unavailable');
      }
      const json = await res.json();
      if (json.ok && json.data) {
        const bulkRaw = Array.isArray(json.data.bulk) ? json.data.bulk : [];
        const blockRaw = Array.isArray(json.data.block) ? json.data.block : [];

        const parseRows = (rawList: any[], dealType: 'BULK' | 'BLOCK'): InstitutionalDeal[] => {
          return rawList.map((row) => {
            const sym = String(row.Symbol || row.SYMBOL || row.symbol || '').toUpperCase().trim();
            const client = String(row['Client Name'] || row.CLIENT_NAME || row.client_name || row.ClientName || 'Institutional Client').trim();
            const actionRaw = String(row['Buy/Sell'] || row.BUY_SELL || row.buy_sell || row.Action || '').toUpperCase().trim();
            
            let action: 'BUY' | 'SELL' | 'UNKNOWN' = 'UNKNOWN';
            if (actionRaw === 'BUY' || actionRaw === 'B') action = 'BUY';
            else if (actionRaw === 'SELL' || actionRaw === 'S') action = 'SELL';

            const qty = safeInt(row['Quantity Traded'] || row.QTY || row.quantity || row.QUANTITY || row.Volume || 0);
            const price = safeFloat(row['Trade Price'] || row.PRICE || row.price || row.TradePrice || 0);
            const secName = String(row['Security Name'] || row.SECURITY_NAME || row.security_name || row.CompanyName || sym);
            const dateStr = String(row.Date || row.DATE || row.date || '');

            // Trade value in Crores: (qty * price) / 10,000,000
            const valCr = (qty * price) / 10000000;

            return {
              symbol: sym,
              securityName: secName,
              clientName: client,
              dealType,
              action,
              quantity: qty,
              price,
              valueCr: valCr,
              date: dateStr,
            };
          }).filter((d) => d.symbol);
        };

        const parsedBulk = parseRows(bulkRaw, 'BULK');
        const parsedBlock = parseRows(blockRaw, 'BLOCK');
        
        // Merge and sort by value (highest first)
        const merged = [...parsedBulk, ...parsedBlock].sort((a, b) => b.valueCr - a.valueCr);
        setDeals(merged.slice(0, limit));
        setError(null);
      } else {
        throw new Error('Invalid deals response format');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch transaction deals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeals();
    const interval = setInterval(fetchDeals, 180000); // 3 minutes
    return () => clearInterval(interval);
  }, [limit]);

  const filteredDeals = deals.filter((deal) => {
    const matchesType = filterType === 'ALL' || deal.dealType === filterType;
    const matchesSearch = 
      deal.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  if (loading && deals.length === 0) {
    return (
      <Card className="bg-terminal-card border-zinc-850 h-[450px] animate-pulse">
        <CardHeader className="pb-2 border-b border-zinc-850">
          <div className="h-4 bg-zinc-850 rounded w-1/4"></div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="h-10 bg-zinc-850 rounded"></div>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-zinc-850 rounded"></div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error && deals.length === 0) {
    return (
      <Card className="bg-terminal-card border-zinc-850 h-[450px] flex flex-col justify-center items-center p-6 text-zinc-550 text-center">
        <ShieldAlert className="h-8 w-8 text-rose-500/80 mb-2 animate-bounce" />
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">Deals Stream Offline</span>
        <p className="text-[10px] text-zinc-650 mt-1 max-w-xs leading-normal">
          {error || 'No active bulk or block deal reports available for this session.'}
        </p>
      </Card>
    );
  }

  return (
    <Card className="bg-terminal-card border-zinc-850 flex flex-col h-full relative overflow-hidden backdrop-blur-sm">
      <CardHeader className="pb-3 border-b border-zinc-850 shrink-0">
        <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center justify-between flex-1">
            <div className="flex items-center gap-1.5 font-mono">
              <Zap className="h-4 w-4 text-amber-400 shrink-0 animate-pulse" />
              Institutional Block & Bulk Deals (7D Feed)
            </div>
            {showViewMore && (
              <Link href="/corporate" className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase font-mono mr-4">
                View All →
              </Link>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Buttons */}
            <div className="flex items-center rounded bg-zinc-950 border border-zinc-850 p-0.5 text-[9px] font-mono">
              {(['ALL', 'BULK', 'BLOCK'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    filterType === type ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-550 hover:text-zinc-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <button 
              onClick={fetchDeals} 
              disabled={loading}
              className="text-zinc-500 hover:text-zinc-300 hover:rotate-180 transition-all duration-500 cursor-pointer disabled:opacity-50"
              title="Refresh Deal Log"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardTitle>

        {/* Search Input Bar */}
        <div className="mt-3 relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-550" />
          <input
            type="text"
            placeholder="Filter by Symbol or Client name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950/80 border border-zinc-850 rounded-lg pl-8 pr-4 py-2 text-[10px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-all font-mono"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-y-auto flex-1 min-h-[300px]">
        {filteredDeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-16">
            <Filter className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs font-mono">No matching transaction records found</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900">
            {filteredDeals.map((deal, idx) => {
              const isMajorTrade = deal.valueCr >= 50; // Transaction above 50 Crores
              const actionClass = 
                deal.action === 'BUY' ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20' : 
                deal.action === 'SELL' ? 'text-rose-400 bg-rose-950/30 border-rose-500/20' : 
                'text-zinc-400 bg-zinc-900 border-zinc-850';

              return (
                <div 
                  key={`${deal.symbol}-${idx}`}
                  className={`p-3 hover:bg-zinc-900/40 transition-all relative group border-l-2 ${
                    isMajorTrade ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-zinc-100 text-xs tracking-wider font-mono">
                        {deal.symbol}
                      </span>
                      <Badge variant="outline" className={`text-[8px] h-4 px-1 py-0 font-mono tracking-wider ${actionClass}`}>
                        {deal.action === 'BUY' ? <ArrowUpRight className="h-2 w-2 mr-0.5 inline shrink-0" /> : <ArrowDownLeft className="h-2 w-2 mr-0.5 inline shrink-0" />}
                        {deal.action}
                      </Badge>
                      <Badge variant="outline" className={`text-[8px] h-4 px-1 py-0 font-mono ${
                        deal.dealType === 'BLOCK' ? 'bg-amber-950/20 text-amber-400 border-amber-500/20' : 'bg-blue-950/20 text-blue-400 border-blue-500/20'
                      }`}>
                        {deal.dealType}
                      </Badge>
                    </div>
                    
                    <div className="text-right">
                      <span className={`text-[11px] font-black font-mono tracking-tight ${
                        isMajorTrade ? 'text-amber-400 font-extrabold' : 'text-zinc-200'
                      }`}>
                        ₹{deal.valueCr.toFixed(2)} Cr
                      </span>
                      {isMajorTrade && (
                        <span className="text-[7px] text-amber-500 font-bold block uppercase tracking-widest font-mono">
                          ★ High Value trade
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[9px] text-zinc-400 font-semibold line-clamp-1 font-mono tracking-wide">
                    {deal.clientName}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[8px] text-zinc-550 font-mono">
                    <div className="flex items-center gap-2">
                      <span>Qty: <span className="text-zinc-400 font-medium">{(deal.quantity / 100000).toFixed(2)}L</span></span>
                      <span>Price: <span className="text-zinc-400 font-medium">₹{deal.price.toFixed(2)}</span></span>
                    </div>
                    <span>{deal.date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Stats Summary Footer */}
      <div className="p-2 border-t border-zinc-850 bg-zinc-950/80 font-mono text-[8px] text-zinc-650 flex justify-between shrink-0">
        <span>Combined Transactions: {filteredDeals.length}</span>
        <span>Largest Deal: ₹{(deals[0]?.valueCr ?? 0).toFixed(2)} Cr</span>
      </div>
    </Card>
  );
}
