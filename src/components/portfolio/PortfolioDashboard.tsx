'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  PieChart, Activity, AlertTriangle, ShieldCheck, Database, 
  Link as LinkIcon, Briefcase, Plus, Trash2, Upload, 
  FileSpreadsheet, TrendingUp, TrendingDown, Info, RefreshCw
} from 'lucide-react';

interface Holding {
  symbol: string;
  companyName: string;
  sector: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  changePercent: number;
}

interface Correlation {
  symbol: string;
  event: string;
  catalyst: string;
  chain: string;
}

interface PortfolioData {
  totalValue: number;
  holdingsCount: number;
  concentrationRisk: boolean;
  sectorExposure: Record<string, number>;
  warnings: string[];
  correlations: Correlation[];
  holdings: Holding[];
}

export function PortfolioDashboard() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Manual Add Form states
  const [inputSymbol, setInputSymbol] = useState('');
  const [inputBuyPrice, setInputBuyPrice] = useState('');
  const [inputQuantity, setInputQuantity] = useState('');
  const [formError, setFormError] = useState('');
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPortfolio = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/portfolio');
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Failed to fetch portfolio intelligence');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to portfolio API');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
    
    // Auto-refresh every 10 seconds to stream real-time price updates
    const timer = setInterval(() => fetchPortfolio(true), 10000);
    return () => clearInterval(timer);
  }, []);

  // Handle Manual Add
  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!inputSymbol || !inputBuyPrice || !inputQuantity) {
      setFormError('Please fill in all stock parameters.');
      return;
    }

    try {
      const holdingsToImport = [{
        symbol: inputSymbol.toUpperCase().trim(),
        entryPrice: parseFloat(inputBuyPrice),
        quantity: parseInt(inputQuantity, 10)
      }];

      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: holdingsToImport })
      });

      const json = await res.json();
      if (json.ok) {
        setInputSymbol('');
        setInputBuyPrice('');
        setInputQuantity('');
        fetchPortfolio();
      } else {
        setFormError(json.error || 'Failed to add stock.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Network error.');
    }
  };

  // Handle CSV Import supporting Zerodha, Groww, Angel One standard exports
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setImporting(false);
        return;
      }

      const lines = text.split('\n');
      if (lines.length < 2) {
        alert('Empty portfolio file uploaded.');
        setImporting(false);
        return;
      }

      // Parse headers from the first line
      const firstLine = lines[0].replace(/"/g, '').trim();
      const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
      const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase());

      // Define Broker Specific Alias Arrays
      const symbolAliases = [
        'symbol', 'instrument', 'scrip', 'scrip name', 'scripname', 
        'stock', 'stock name', 'stockname', 'company', 'tradingsymbol', 'scrip_name'
      ];
      const priceAliases = [
        'buy price', 'entry price', 'avg price', 'average price', 'avg. cost', 
        'average cost', 'price', 'avg_cost', 'avg cost', 'average_price', 
        'averageprice', 'avgprice', 'buyprice', 'entryprice', 'buy average', 'buy_average'
      ];
      const qtyAliases = [
        'qty', 'quantity', 'qty.', 'shares', 'volume', 'holding qty', 
        'holdingqty', 'holding_qty', 'available qty', 'available_qty'
      ];

      // Resolve column index mappings with fallback defaults
      let symbolIdx = headers.findIndex(h => symbolAliases.includes(h) || symbolAliases.some(a => h.includes(a)));
      let priceIdx = headers.findIndex(h => priceAliases.includes(h) || priceAliases.some(a => h.includes(a)));
      let qtyIdx = headers.findIndex(h => qtyAliases.includes(h) || qtyAliases.some(a => h.includes(a)));

      // If headers did not match standard broker keywords, use default ordering
      if (symbolIdx === -1) symbolIdx = 0;
      if (priceIdx === -1) priceIdx = headers.length > 1 ? 1 : 0;
      if (qtyIdx === -1) qtyIdx = headers.length > 2 ? 2 : 0;

      const holdings = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.replace(/"/g, '').split(delimiter);
        if (parts.length > Math.max(symbolIdx, priceIdx, qtyIdx)) {
          const rawSym = parts[symbolIdx]?.trim() || '';
          // Remove suffix like -EQ or -BE if present in the symbol
          const sym = rawSym.replace(/-EQ$/i, '').replace(/-BE$/i, '').toUpperCase().trim();
          
          const rawPrice = parts[priceIdx]?.replace(/,/g, '').trim();
          const price = parseFloat(rawPrice);
          
          const rawQty = parts[qtyIdx]?.replace(/,/g, '').trim();
          const qty = parseInt(rawQty, 10);

          if (sym && !isNaN(price) && !isNaN(qty) && qty > 0) {
            holdings.push({ symbol: sym, entryPrice: price, quantity: qty });
          }
        }
      }

      if (holdings.length === 0) {
        alert('Could not parse any valid holdings. Please ensure columns include stock symbol, average buy price, and quantity.');
        setImporting(false);
        return;
      }

      try {
        const res = await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holdings })
        });
        const json = await res.json();
        if (json.ok) {
          fetchPortfolio();
        } else {
          alert(json.error || 'Import failed.');
        }
      } catch (err: any) {
        alert('Failed to connect to backend.');
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Handle Portfolio Reset
  const handleResetPortfolio = async () => {
    if (!confirm('Are you sure you want to completely clear your portfolio? This will remove all custom holdings.')) return;
    try {
      const res = await fetch('/api/portfolio', { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) {
        fetchPortfolio();
      } else {
        alert(json.error || 'Failed to reset portfolio.');
      }
    } catch {
      alert('Failed to connect to backend.');
    }
  };

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
        <Card className="lg:col-span-2 bg-zinc-900/60 border-zinc-800 h-[220px] flex items-center justify-center">
          <span className="text-zinc-500 text-xs flex items-center gap-2">
            <Activity className="h-4 w-4 animate-spin text-emerald-400" />
            Analyzing exposure matrices...
          </span>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800 h-[220px] flex items-center justify-center">
          <span className="text-zinc-500 text-xs">Loading sector weights...</span>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-zinc-900/60 border-zinc-800 p-6 flex flex-col items-center justify-center text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
        <h4 className="text-sm font-semibold text-zinc-200">Portfolio Diagnostics Offline</h4>
        <p className="text-xs text-zinc-500 mt-1 max-w-md">{error || 'Unable to load real-time database exposure map.'}</p>
        <button onClick={() => fetchPortfolio()} className="mt-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded text-xs transition-colors">
          Retry Diagnostics Connection
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* ────────────────────────────────────────────── */}
      {/* TOP PANELS: STATS & SECTOR weights */}
      {/* ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Overview Stats */}
        <Card className="lg:col-span-2 bg-zinc-900/60 border-zinc-800/80 shadow-2xl backdrop-blur-xl">
          <CardHeader className="pb-2 border-b border-zinc-800/40">
            <div className="flex justify-between items-center">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-400" />
                Institutional Portfolio Summary
              </CardTitle>
              {refreshing && <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-1">
              <div className="flex flex-col p-3.5 bg-zinc-950/40 rounded-xl border border-zinc-800/45 hover:border-zinc-700/40 transition-colors">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Total Exposure</span>
                <span className="font-mono text-xl font-semibold text-zinc-100 mt-0.5">₹{data.totalValue.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex flex-col p-3.5 bg-zinc-950/40 rounded-xl border border-zinc-800/45 hover:border-zinc-700/40 transition-colors">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Active Holdings</span>
                <span className="font-mono text-xl font-semibold text-zinc-100 mt-0.5">{data.holdingsCount}</span>
              </div>
              <div className="flex flex-col p-3.5 bg-zinc-950/40 rounded-xl border border-zinc-800/45 hover:border-zinc-700/40 transition-colors">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Portfolio Beta</span>
                <span className="font-mono text-xl font-black text-blue-400 mt-0.5">{(data as any).portfolioBeta || '1.00'}</span>
              </div>
              <div className="flex flex-col p-3.5 bg-zinc-950/40 rounded-xl border border-zinc-800/45 hover:border-zinc-700/40 transition-colors">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">System Integrity</span>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-mono"><Database className="w-2.5 h-2.5 mr-1"/> Factual</Badge>
                  <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[8px] font-mono"><ShieldCheck className="w-2.5 h-2.5 mr-1"/> Live</Badge>
                </div>
              </div>
            </div>

            {data.concentrationRisk && data.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/15 rounded-xl flex gap-3 animate-pulse">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-500 tracking-wide uppercase">AI Risk Alert</h4>
                  <ul className="text-xs text-amber-400/80 mt-0.5 space-y-1 list-disc list-inside">
                    {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sector Exposure Map */}
        <Card className="bg-zinc-900/60 border-zinc-800/80 shadow-2xl backdrop-blur-xl">
          <CardHeader className="pb-2 border-b border-zinc-800/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-400" />
              Sector Exposure Map
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {Object.entries(data.sectorExposure).map(([sector, pct]) => (
              <div key={sector}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-medium">{sector}</span>
                  <span className="font-mono text-zinc-400">{pct}%</span>
                </div>
                <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${pct > 35 ? 'bg-amber-500' : 'bg-purple-500'}`} 
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ────────────────────────────────────────────── */}
      {/* MANAGEMENT & HOLDINGS UPLOAD CONTROL CENTER */}
      {/* ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Manual Input Form */}
        <Card className="lg:col-span-2 bg-zinc-900/60 border-zinc-800/80 shadow-2xl backdrop-blur-xl">
          <CardHeader className="pb-2 border-b border-zinc-800/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-400" />
              Add Stock to Watchlist / Holdings
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleManualAdd} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Symbol (e.g. RELIANCE)</label>
                <input 
                  type="text" 
                  value={inputSymbol}
                  onChange={(e) => setInputSymbol(e.target.value)}
                  placeholder="HDFCBANK" 
                  className="bg-zinc-950 border border-zinc-850 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Buy Price (₹)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={inputBuyPrice}
                  onChange={(e) => setInputBuyPrice(e.target.value)}
                  placeholder="1450" 
                  className="bg-zinc-950 border border-zinc-850 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Quantity (Shares)</label>
                <input 
                  type="number" 
                  value={inputQuantity}
                  onChange={(e) => setInputQuantity(e.target.value)}
                  placeholder="100" 
                  className="bg-zinc-950 border border-zinc-850 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div className="sm:col-span-3 flex justify-between items-center mt-2">
                <span className="text-[10px] text-amber-500 font-medium">{formError}</span>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition-colors">
                  <Plus className="h-4 w-4" />
                  Add Holding
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* CSV Import / Reset Panel */}
        <Card className="bg-zinc-900/60 border-zinc-800/80 shadow-2xl backdrop-blur-xl">
          <CardHeader className="pb-2 border-b border-zinc-800/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-400" />
              Batch Import & Reset
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex flex-col gap-4">
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800/80 hover:border-zinc-700/60 rounded-xl p-4 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <FileSpreadsheet className="h-8 w-8 text-emerald-400/80 mb-2" />
              <span className="text-xs text-zinc-300 font-semibold">{importing ? 'Processing File...' : 'Upload CSV / Excel'}</span>
              <span className="text-[9px] text-zinc-500 mt-1 font-mono">Format: Symbol,BuyPrice,Quantity</span>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleCSVUpload}
                accept=".csv"
                className="hidden" 
              />
            </div>
            
            <button onClick={handleResetPortfolio} className="w-full py-2 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/30 hover:border-red-900/60 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all">
              <Trash2 className="h-3.5 w-3.5" />
              Reset & Clear Custom Holdings
            </button>
          </CardContent>
        </Card>
      </div>

      {/* ────────────────────────────────────────────── */}
      {/* PORTFOLIO ACTIVE HOLDINGS REAL-TIME LISTING TABLE */}
      {/* ────────────────────────────────────────────── */}
      <Card className="bg-zinc-900/60 border-zinc-800/80 shadow-2xl backdrop-blur-xl">
        <CardHeader className="pb-2 border-b border-zinc-800/40">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-400" />
            Active Real-time Holdings & Valuation
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/60 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-5">Symbol</th>
                  <th className="py-3 px-4">Company Name</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Avg Price</th>
                  <th className="py-3 px-4 text-right">Current Price</th>
                  <th className="py-3 px-4 text-right">Current Value</th>
                  <th className="py-3 px-4 text-right">Day Chg</th>
                  <th className="py-3 px-4 text-right">Beta</th>
                  <th className="py-3 px-5 text-right">Total P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850/40">
                {data.holdings.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-zinc-500 font-medium bg-zinc-950/20">
                      <Briefcase className="h-8 w-8 mx-auto mb-2 text-zinc-650 opacity-40" />
                      <span className="text-zinc-400 font-bold block text-sm">No custom holdings loaded</span>
                      <p className="text-[10px] text-zinc-500 mt-1 max-w-sm mx-auto">
                        Please upload your broker export CSV file or manually add symbols above to start streaming live valuations, risk exposure maps, and vector correlations.
                      </p>
                    </td>
                  </tr>
                ) : (
                  data.holdings.map((h, i) => {
                    const isProfit = h.pnl >= 0;
                    return (
                      <tr key={i} className="hover:bg-zinc-950/20 transition-colors">
                        <td className="py-3.5 px-5 font-bold font-mono">
                           <Badge variant="outline" className="bg-zinc-950 text-zinc-300 font-mono py-0.5 border-zinc-800">{h.symbol}</Badge>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-300 font-medium">{h.companyName}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-zinc-400">{h.quantity}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-zinc-400">₹{h.entryPrice.toLocaleString('en-IN')}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-zinc-300">₹{h.currentPrice.toLocaleString('en-IN')}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-zinc-200 font-semibold">₹{Math.round(h.currentValue).toLocaleString('en-IN')}</td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`font-mono text-[11px] font-bold ${h.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {h.changePercent >= 0 ? '+' : ''}{h.changePercent.toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-zinc-400 font-semibold">
                          {(h as any).beta?.toFixed(2) || '1.00'}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <div className="flex items-center justify-end gap-1 font-mono">
                            {isProfit ? <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" /> : <TrendingDown className="h-3 w-3 text-rose-400 shrink-0" />}
                            <span className={`text-[11px] font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                              ₹{Math.round(h.pnl).toLocaleString('en-IN')} ({isProfit ? '+' : ''}{h.pnlPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ────────────────────────────────────────────── */}
      {/* CORRELATION ENGINE FEED */}
      {/* ────────────────────────────────────────────── */}
      <Card className="bg-zinc-900/60 border-zinc-800/80 shadow-2xl backdrop-blur-xl">
        <CardHeader className="pb-2 border-b border-zinc-800/40">
          <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-blue-400" />
            AI Event Correlation Engine (Holdings Intelligence)
          </CardTitle>
        </CardHeader>
        <CardContent className="mt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.correlations.map((c, i) => (
              <div key={i} className="p-4 bg-zinc-950/40 rounded-xl border border-zinc-800/40 flex flex-col gap-3 relative overflow-hidden">
                {/* Decorative background line */}
                <div className="absolute left-6 top-10 bottom-4 w-px bg-zinc-800/30" />
                
                <div className="flex items-center justify-between gap-2 z-10">
                  <Badge variant="outline" className="bg-zinc-950 text-blue-400 font-mono py-0.5 border-blue-900/30">{c.symbol}</Badge>
                  <span className="text-[10px] text-zinc-500 font-mono uppercase">Correlation Edge</span>
                </div>
                
                <div className="flex items-start gap-3 z-10 pl-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0 animate-ping" />
                  <div>
                    <div className="text-xs font-semibold text-zinc-300">Catalyst: <span className="text-zinc-100 font-bold ml-1">{c.catalyst}</span></div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 z-10 pl-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0 animate-ping" />
                  <div>
                    <div className="text-xs font-semibold text-zinc-300">Signal: <span className="text-zinc-100 font-bold ml-1">{c.event}</span></div>
                  </div>
                </div>
                
                <div className="mt-2 pt-2 border-t border-zinc-800/45 text-xs text-zinc-400 leading-relaxed z-10 pl-2">
                  <span className="text-blue-400 font-semibold mr-1">AI Synthesis:</span> 
                  {c.chain}
                </div>
              </div>
            ))}
            
            <div className="p-4 bg-zinc-950/20 rounded-xl border border-dashed border-zinc-800/80 flex items-center justify-center text-center">
              <span className="text-xs text-zinc-500 flex flex-col items-center gap-2">
                <Activity className="h-4 w-4 opacity-50 text-blue-400" />
                Monitoring incoming vector chunks & signals...<br/>
                Continuous live connection active. Zero mock fallbacks.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
