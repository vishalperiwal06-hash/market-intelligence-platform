'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CompanyLogo } from '@/components/market/CompanyLogo';
import { 
  Search, FileText, AlertCircle, Clock, Sparkles, X, Brain, 
  Activity, TrendingUp, TrendingDown, RefreshCw, ArrowUpRight, 
  Layers, Flame, Shield, ChevronRight, HelpCircle
} from 'lucide-react';
import { formatPrice, formatPercent } from '@/lib/formatters';

interface CorporateFiling {
  id: string;
  exchange: string;
  symbol: string;
  companyName: string;
  category: string;
  subject: string;
  details: string | null;
  broadcastDate: string;
  reflectedAt: string;
  priceAtAnnouncement: number | null;
  pdfUrl: string | null;
  receiptDate?: string;
  // Dynamic fields calculated client-side
  currentPrice?: number | null;
  impactPercent?: number;
}

export default function FilingsPage() {
  const [filings, setFilings] = useState<CorporateFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  
  // Real-time Quotes Map for live ticking price action
  const [quotesMap, setQuotesMap] = useState<Record<string, any>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);

  // Top Movers side panel states (Top 10 strongest & Top 10 weaker)
  const [strongestMovers, setStrongestMovers] = useState<CorporateFiling[]>([]);
  const [weakerMovers, setWeakerMovers] = useState<CorporateFiling[]>([]);
  const [moversLoading, setMoversLoading] = useState(true);

  // AI Modal states
  const [selectedFiling, setSelectedFiling] = useState<CorporateFiling | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Fetch live quotes mapping to calculate real-time impact tick
  const fetchLiveQuotes = useCallback(async () => {
    try {
      setQuotesLoading(true);
      const res = await fetch('/api/market/quotes');
      const data = await res.json();
      if (data.ok && data.data) {
        const map: Record<string, any> = {};
        data.data.forEach((q: any) => {
          map[q.symbol.toUpperCase().trim()] = q;
        });
        setQuotesMap(map);
      }
    } catch (e) {
      console.error('Failed to fetch live quotes for filings', e);
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  // 2. Fetch main filings feed
  const fetchFilings = useCallback((search = '', category: string | null = null) => {
    setLoading(true);
    let url = `/api/corporate/filings?limit=80`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }
    if (category) {
      url += `&category=${encodeURIComponent(category)}`;
    }

    fetch(url)
      .then((res) => res.json())
      .then((res) => {
        if (res && res.filings) {
          setFilings(res.filings);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load filings:', err);
        setLoading(false);
      });
  }, []);

  // 3. Fetch Top Movers calculated by filings impact API
  const fetchTopMovers = useCallback(async () => {
    try {
      setMoversLoading(true);
      const res = await fetch('/api/corporate/filings/impact');
      const data = await res.json();
      if (data.ok) {
        setStrongestMovers((data.strongest || []).slice(0, 10));
        setWeakerMovers((data.weaker || []).slice(0, 10));
      }
    } catch (e) {
      console.error('Failed to fetch filings impact movers', e);
    } finally {
      setMoversLoading(false);
    }
  }, []);

  // Sync loop
  useEffect(() => {
    fetchFilings();
    fetchLiveQuotes();
    fetchTopMovers();

    // Set intervals for high-speed sync
    const quoteInterval = setInterval(fetchLiveQuotes, 15000); // Poll prices every 15s
    const feedInterval = setInterval(() => {
      fetchFilings(searchQuery, activeCategory);
      fetchTopMovers();
    }, 30000); // Ingest announcements every 30s

    return () => {
      clearInterval(quoteInterval);
      clearInterval(feedInterval);
    };
  }, [fetchFilings, fetchLiveQuotes, fetchTopMovers]);

  // Handle Search Input with debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchFilings(value, activeCategory);
    }, 300);
  };

  const handleCategorySelect = (category: string | null) => {
    setActiveCategory(category);
    fetchFilings(searchQuery, category);
  };

  // Trigger AI parsed PDF summarizer
  const handleAISummarize = async (e: React.MouseEvent, filing: CorporateFiling) => {
    e.stopPropagation();
    setSelectedFiling(filing);
    setLoadingSummary(true);
    setAiSummary('');
    setSummaryModalOpen(true);

    try {
      const res = await fetch(`/api/corporate/filings/${filing.id}/summarize`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        setAiSummary(data.summary);
      } else {
        setAiSummary(`### Synthesis Failure\nFailed to compile factual summary: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setAiSummary(`### Network Exception\nFailed to establish connection with secure AI engine: ${err.message}`);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Compile coordinates and real-time impact for a filing
  const getFilingCoordinates = (f: CorporateFiling) => {
    const quote = quotesMap[f.symbol.toUpperCase().trim()];
    const currentPrice = quote ? quote.price : f.priceAtAnnouncement;
    const priceAtAnnouncement = f.priceAtAnnouncement;

    let impactPercent = 0;
    if (currentPrice && priceAtAnnouncement && priceAtAnnouncement > 0) {
      impactPercent = ((currentPrice - priceAtAnnouncement) / priceAtAnnouncement) * 100;
    }

    const bDateParsed = new Date(f.broadcastDate);
    const rDate = new Date(f.reflectedAt || Date.now());
    
    // Robust Indian exchange time parsing
    // If broadcastDate has a truncated date-only format, it parses as midnight UTC, which in IST (UTC+5:30) is exactly 05:30:00.
    // If that occurs, we fall back to receiptDate (which carries the full exchange timestamp).
    let exchangeDate = bDateParsed;
    if (bDateParsed.getHours() === 5 && bDateParsed.getMinutes() === 30 && bDateParsed.getSeconds() === 0 && f.receiptDate) {
      exchangeDate = new Date(f.receiptDate);
    }
    
    const bTime = exchangeDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const rTime = rDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    
    // Exact delay sync in seconds
    const diffSec = Math.max(0, Math.round((rDate.getTime() - exchangeDate.getTime()) / 1000));
    const syncLag = diffSec < 60 ? `${diffSec}s` : `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`;

    return {
      currentPrice,
      priceAtAnnouncement,
      impactPercent,
      exchTime: bTime,
      platformTime: rTime,
      syncLag,
    };
  };

  const categoriesList = [
    { value: null, label: 'All Disclosures' },
    { value: 'Financial Results', label: 'Financial Results' },
    { value: 'Results Announcement Date', label: 'Results Date Intimation' },
    { value: 'Order Win', label: 'Order Wins' },
    { value: 'Dividends', label: 'Dividends & Payouts' },
    { value: 'Board Meeting', label: 'Board Meetings' },
    { value: 'Press Release', label: 'Press Releases' },
  ];

  const getCategoryStyles = (cat: string) => {
    if (cat === 'Financial Results') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (cat === 'Results Announcement Date') return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    if (cat === 'Dividends') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (cat === 'Order Win') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (cat === 'Board Meeting') return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
    if (cat === 'Press Release') return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    return 'bg-zinc-850/50 text-zinc-400 border-zinc-800';
  };

  return (
    <div className="space-y-6 max-w-[1820px] mx-auto pb-10 font-mono text-zinc-100 relative">
      
      {/* BACKGROUND DECORATIVE ORBS */}
      <div className="absolute top-0 left-1/4 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-1/4 w-[250px] h-[250px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* DYNAMIC TELEMETRY BANNER */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-zinc-950/80 border border-zinc-850 rounded-xl p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <div>
            <span className="text-[8px] text-zinc-550 block uppercase tracking-widest font-black">Exchange Feeds</span>
            <span className="text-xs font-bold text-zinc-250 uppercase font-mono">BSE / NSE live</span>
          </div>
        </div>
        <div className="flex items-center gap-3 border-l border-zinc-900/60 pl-3">
          <Activity className="h-4 w-4 text-emerald-400 animate-spin shrink-0" />
          <div>
            <span className="text-[8px] text-zinc-550 block uppercase tracking-widest font-black">Ingester Polling</span>
            <span className="text-xs font-bold text-zinc-250 uppercase font-mono">Every 30 seconds</span>
          </div>
        </div>
        <div className="flex items-center gap-3 border-l border-zinc-900/60 pl-3 col-span-1">
          <Layers className="h-4 w-4 text-blue-400 shrink-0" />
          <div>
            <span className="text-[8px] text-zinc-550 block uppercase tracking-widest font-black">Total Ingested</span>
            <span className="text-xs font-bold text-zinc-200 font-mono">{filings.length || '---'} Disclosures</span>
          </div>
        </div>
        <div className="flex items-center gap-3 border-l border-zinc-900/60 pl-3">
          <Shield className="h-4 w-4 text-indigo-400 shrink-0" />
          <div>
            <span className="text-[8px] text-zinc-550 block uppercase tracking-widest font-black">Factual AI Guard</span>
            <span className="text-xs font-bold text-zinc-250 uppercase font-mono">Zero-Fabrication</span>
          </div>
        </div>
      </div>

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
        <div>
          <h1 className="text-xl font-black tracking-tight text-zinc-100 uppercase font-mono flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-emerald-500 rounded-sm animate-pulse inline-block" />
            Live Corporate Filings Impact Terminal
          </h1>
          <p className="text-[9px] text-zinc-600 font-semibold tracking-widest uppercase font-mono">
            High-Speed Segregation · Platform Lag tracking · Real-time price action impact
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search companies, ticker, keyword..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-9 text-[10px] bg-zinc-950/90 border-zinc-800 text-zinc-100 placeholder-zinc-500 font-mono focus-visible:ring-1 focus-visible:ring-zinc-700 h-9"
            />
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchFilings(searchQuery, activeCategory);
              fetchLiveQuotes();
              fetchTopMovers();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-750 text-[10px] font-bold text-zinc-300 transition-all cursor-pointer h-9 shadow-lg"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            RE-SYNC
          </button>
        </div>
      </div>

      {/* SEGREGATED CATEGORIES LIST */}
      <div className="flex flex-wrap gap-1.5 pb-2 px-1">
        {categoriesList.map((cat) => {
          const isSelected = activeCategory === cat.value;
          return (
            <button
              key={cat.label}
              onClick={() => handleCategorySelect(cat.value)}
              className={`text-[9px] uppercase tracking-wider font-bold px-3.5 py-2 rounded transition-all cursor-pointer border ${
                isSelected
                  ? 'bg-gradient-to-r from-emerald-600/20 to-teal-600/25 border-emerald-500/30 text-emerald-400 shadow-md shadow-emerald-500/5'
                  : 'bg-zinc-950/70 text-zinc-500 border-zinc-850 hover:border-zinc-800 hover:text-zinc-300'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* MAIN SCREENER GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: LIVE INGESTION DISCLOSURES FEED */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-zinc-950/40 border border-zinc-850 rounded-xl p-3 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Live Disclosures Inflow</span>
            <div className="flex items-center gap-1.5 text-[9px] text-zinc-650">
              <span>Sync Status:</span>
              <span className="text-emerald-400 font-bold uppercase">Ready</span>
            </div>
          </div>

          <div className="space-y-4">
            {loading && filings.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="bg-zinc-950/60 border-zinc-900 backdrop-blur-md">
                  <CardContent className="p-4 flex gap-4">
                    <div className="bg-zinc-900 rounded border border-zinc-800 w-14 h-14 shrink-0 animate-pulse"></div>
                    <div className="flex-1 space-y-2.5">
                      <div className="h-4 w-1/4 bg-zinc-850 rounded animate-pulse"></div>
                      <div className="h-3 w-full bg-zinc-850/50 rounded animate-pulse"></div>
                      <div className="h-3 w-1/3 bg-zinc-850/30 rounded animate-pulse"></div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filings.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 text-zinc-600 border border-zinc-850/50 border-dashed rounded-xl bg-zinc-950/20">
                <AlertCircle className="h-10 w-10 opacity-30 mb-3" />
                <p className="text-xs uppercase font-bold tracking-wider">No matching announcements registered.</p>
                <p className="text-[10px] text-zinc-500 font-sans mt-1">Ingestion engine remains active. Checking feeds...</p>
              </div>
            ) : (
              filings.map((filing) => {
                const coordinates = getFilingCoordinates(filing);
                
                return (
                  <Card
                    key={filing.id}
                    className="bg-zinc-950/65 border border-zinc-850 hover:border-zinc-700/60 hover:bg-zinc-950/80 transition-all duration-300 backdrop-blur-md overflow-hidden relative group"
                  >
                    {/* ACCENT INDICATOR BAR */}
                    <div className={`absolute top-0 bottom-0 left-0 w-[3px] transition-all ${
                      coordinates.impactPercent > 0 
                        ? 'bg-emerald-500/80 group-hover:bg-emerald-400' 
                        : coordinates.impactPercent < 0 
                        ? 'bg-rose-500/80 group-hover:bg-rose-400' 
                        : 'bg-zinc-750 group-hover:bg-zinc-650'
                    }`} />

                    <CardContent className="p-4 sm:p-5 flex gap-4 items-start relative pl-5 sm:pl-6">
                      
                      {/* LOGO & EXCHANGE INTRO */}
                      <div className="flex flex-col items-center justify-center bg-zinc-900/60 group-hover:bg-zinc-900 rounded border border-zinc-850 w-14 h-14 shrink-0 transition-colors">
                        <CompanyLogo symbol={filing.symbol} companyName={filing.companyName} size="sm" />
                        <span className="text-[8px] font-bold text-zinc-500 mt-1 uppercase">
                          {filing.exchange}
                        </span>
                      </div>

                      {/* INGESTION & MARKET PARAMETERS */}
                      <div className="flex-1 space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
                              {filing.symbol}
                            </span>
                            <span className="text-[10px] text-zinc-300 font-bold truncate max-w-[180px] font-sans">
                              {filing.companyName}
                            </span>
                            <Badge variant="outline" className={`text-[8px] h-4.5 px-2 py-0 font-mono uppercase font-black ${getCategoryStyles(filing.category)}`}>
                              {filing.category}
                            </Badge>
                          </div>

                          {/* DELAY SYNC LATENCY METER */}
                          <div className="text-[7.5px] text-zinc-500 font-mono text-right leading-snug space-y-0.5 border border-zinc-900/60 p-1.5 rounded bg-zinc-950/40">
                            <div>Exch: <span className="text-zinc-400">{coordinates.exchTime}</span></div>
                            <div>Platform: <span className="text-zinc-400">{coordinates.platformTime}</span></div>
                            <div className="text-indigo-400 font-bold">Sync Delay: {coordinates.syncLag}</div>
                          </div>
                        </div>

                        {/* FILING HEADLINE */}
                        <h3 className="text-xs font-black text-zinc-200 group-hover:text-emerald-400 transition-colors leading-relaxed">
                          {filing.subject}
                        </h3>

                        {/* BRIEF DESCRIPTION PANEL */}
                        {filing.details && (
                          <p className="text-[10px] text-zinc-500 leading-relaxed bg-zinc-900/10 p-2 rounded border border-zinc-850/40 line-clamp-2 font-sans">
                            {filing.details}
                          </p>
                        )}

                        {/* ANNOUNCEMENT VS LIVE PERFORMANCE TICK */}
                        <div className="flex flex-wrap items-center justify-between border-t border-zinc-900/80 pt-3 mt-1 gap-2">
                          <div className="flex items-center gap-4 text-[9px] text-zinc-400 font-mono">
                            <div>
                              Filing Price: <span className="text-zinc-200 font-bold">₹{coordinates.priceAtAnnouncement?.toFixed(2) || '--'}</span>
                            </div>
                            {coordinates.priceAtAnnouncement && (
                              <>
                                <div className="border-l border-zinc-800 h-3" />
                                <div>
                                  Live Quote: <span className="text-zinc-250">₹{coordinates.currentPrice?.toFixed(2)}</span>
                                </div>
                                <div className="border-l border-zinc-800 h-3" />
                                <div className="flex items-center gap-1">
                                  Post-Impact: 
                                  <span className={`font-bold px-1.5 py-0.5 rounded text-[8px] ${
                                    coordinates.impactPercent > 0 
                                      ? 'text-emerald-400 bg-emerald-500/5 border border-emerald-500/10' 
                                      : coordinates.impactPercent < 0 
                                      ? 'text-rose-400 bg-rose-500/5 border border-rose-500/10' 
                                      : 'text-zinc-400 bg-zinc-800/10'
                                  }`}>
                                    {coordinates.impactPercent > 0 ? '+' : ''}{coordinates.impactPercent?.toFixed(2)}%
                                  </span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* ACTION triggers (PDF & AI Modal) */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {filing.pdfUrl ? (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.open(filing.pdfUrl!, '_blank');
                                }}
                                className="p-1 px-2.5 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer flex items-center gap-1 font-mono text-[8px] font-black uppercase"
                                title="Open Exchange PDF"
                              >
                                <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                                DOC PDF
                              </button>
                            ) : (
                              <span className="text-[8px] text-zinc-650 font-bold uppercase">NO PDF</span>
                            )}
                            <button 
                              onClick={(e) => handleAISummarize(e, filing)}
                              className="flex items-center gap-1.5 text-[8px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/15 hover:bg-emerald-500/10 hover:border-emerald-500/35 px-3 py-1.5 rounded font-black transition-all cursor-pointer uppercase"
                            >
                              <Sparkles className="h-3 w-3" />
                              AI Summarize
                            </button>
                          </div>
                        </div>

                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: PREMIUM TOP 10 STRONGEST & WEAKER MOVERS GRID PANEL */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* STRONGEST POST-ANNOUNCEMENT MOVERS */}
          <Card className="bg-zinc-950/80 border border-emerald-500/20 shadow-xl backdrop-blur-md font-mono">
            <CardHeader className="pb-3 border-b border-zinc-900/60 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-500 animate-pulse" />
                Top Bullish Reactions (Strongest)
              </CardTitle>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[8px]">
                LIVE Ticks
              </Badge>
            </CardHeader>
            <CardContent className="p-2 divide-y divide-zinc-900/80">
              {moversLoading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <RefreshCw className="h-5 w-5 text-emerald-500 animate-spin mb-2" />
                  <span className="text-[8px] text-zinc-550 uppercase font-black">Aggregating quotes...</span>
                </div>
              ) : strongestMovers.length === 0 ? (
                <p className="py-8 text-center text-zinc-650 text-[9px] uppercase font-bold">No reactions captured yet.</p>
              ) : (
                strongestMovers.map((m, i) => (
                  <div key={m.id || i} className="py-2.5 px-1.5 hover:bg-zinc-900/20 transition-all flex items-start justify-between gap-3 group">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CompanyLogo symbol={m.symbol} size="sm" />
                        <span className="font-bold text-zinc-200 text-[10px] group-hover:text-emerald-400 transition-colors">{m.symbol}</span>
                        <Badge className="bg-zinc-900 text-zinc-400 text-[6.5px] border-zinc-800 scale-95 origin-left py-0 h-3.5 uppercase">
                          {m.category === 'Results Announcement Date' ? 'Res Intim' : m.category}
                        </Badge>
                      </div>
                      <p className="text-[8.5px] text-zinc-500 truncate max-w-[190px] font-sans" title={m.subject}>
                        {m.subject}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1 py-0.5 rounded">
                        +{m.impactPercent?.toFixed(2)}%
                      </span>
                      <div className="text-[7.5px] text-zinc-550 mt-1 font-mono">
                        ₹{m.currentPrice?.toFixed(1)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* WEAKER POST-ANNOUNCEMENT MOVERS */}
          <Card className="bg-zinc-950/80 border border-rose-500/20 shadow-xl backdrop-blur-md font-mono">
            <CardHeader className="pb-3 border-b border-zinc-900/60 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-rose-500 animate-pulse" />
                Top Bearish Reactions (Weaker)
              </CardTitle>
              <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[8px]">
                LIVE Ticks
              </Badge>
            </CardHeader>
            <CardContent className="p-2 divide-y divide-zinc-900/80">
              {moversLoading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <RefreshCw className="h-5 w-5 text-rose-500 animate-spin mb-2" />
                  <span className="text-[8px] text-zinc-550 uppercase font-black">Aggregating quotes...</span>
                </div>
              ) : weakerMovers.length === 0 ? (
                <p className="py-8 text-center text-zinc-650 text-[9px] uppercase font-bold">No reactions captured yet.</p>
              ) : (
                weakerMovers.map((m, i) => (
                  <div key={m.id || i} className="py-2.5 px-1.5 hover:bg-zinc-900/20 transition-all flex items-start justify-between gap-3 group">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CompanyLogo symbol={m.symbol} size="sm" />
                        <span className="font-bold text-zinc-200 text-[10px] group-hover:text-rose-400 transition-colors">{m.symbol}</span>
                        <Badge className="bg-zinc-900 text-zinc-400 text-[6.5px] border-zinc-800 scale-95 origin-left py-0 h-3.5 uppercase">
                          {m.category === 'Results Announcement Date' ? 'Res Intim' : m.category}
                        </Badge>
                      </div>
                      <p className="text-[8.5px] text-zinc-500 truncate max-w-[190px] font-sans" title={m.subject}>
                        {m.subject}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[9px] font-black text-rose-400 bg-rose-500/5 border border-rose-500/10 px-1 py-0.5 rounded">
                        {m.impactPercent?.toFixed(2)}%
                      </span>
                      <div className="text-[7.5px] text-zinc-550 mt-1 font-mono">
                        ₹{m.currentPrice?.toFixed(1)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>

      </div>

      {/* ────────────────────────────────────────────── */}
      {/* DEEP AI REASONING DOCUMENT SYNTHESIS MODAL */}
      {/* ────────────────────────────────────────────── */}
      {summaryModalOpen && selectedFiling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/85 backdrop-blur-md transition-all duration-300">
          <div className="bg-zinc-900/95 border border-zinc-800/80 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden font-mono">
            
            {/* Top accent glow line */}
            <div className="h-[2px] w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />
            
            {/* Header */}
            <div className="p-4 border-b border-zinc-800/80 flex items-start justify-between bg-zinc-950/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[8px] tracking-wider font-bold">
                    FREE AI ANALYSIS
                  </Badge>
                  <span className="text-[10px] text-zinc-500">
                    {selectedFiling.symbol} · {selectedFiling.category}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-zinc-200 leading-snug font-sans">
                  {selectedFiling.subject}
                </h3>
              </div>
              <button
                onClick={() => setSummaryModalOpen(false)}
                className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Document stats */}
            <div className="bg-zinc-950/30 px-4 py-2 border-b border-zinc-850 grid grid-cols-3 gap-4 text-[9px] text-zinc-400">
              <div>
                <span className="text-zinc-650 block uppercase">Filing Price Baseline</span>
                <span className="font-bold text-zinc-350">₹{selectedFiling.priceAtAnnouncement?.toFixed(2) || 'N/A'}</span>
              </div>
              <div>
                <span className="text-zinc-650 block uppercase">Current Quote</span>
                <span className="font-bold text-zinc-350">
                  ₹{quotesMap[selectedFiling.symbol.toUpperCase().trim()]?.price?.toFixed(2) || selectedFiling.priceAtAnnouncement?.toFixed(2) || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-zinc-650 block uppercase">Platform Impact</span>
                <span className={`font-bold ${(() => {
                  const q = quotesMap[selectedFiling.symbol.toUpperCase().trim()];
                  const p = q ? q.price : selectedFiling.priceAtAnnouncement;
                  const baseline = selectedFiling.priceAtAnnouncement;
                  let delta = 0;
                  if (p && baseline) delta = ((p - baseline) / baseline) * 100;
                  return delta >= 0 ? 'text-emerald-400' : 'text-rose-400';
                })()}`}>
                  {(() => {
                    const q = quotesMap[selectedFiling.symbol.toUpperCase().trim()];
                    const p = q ? q.price : selectedFiling.priceAtAnnouncement;
                    const baseline = selectedFiling.priceAtAnnouncement;
                    let delta = 0;
                    if (p && baseline) delta = ((p - baseline) / baseline) * 100;
                    return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`;
                  })()}
                </span>
              </div>
            </div>

            {/* Content body */}
            <div className="p-5 overflow-y-auto text-zinc-300 leading-relaxed font-sans text-xs flex-1 space-y-4">
              {loadingSummary ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3 font-mono">
                  <RefreshCw className="h-7 w-7 text-emerald-500 animate-spin" />
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider animate-pulse">
                    Synthesizing PDF Document Intelligence...
                  </p>
                  <p className="text-[9px] text-zinc-500 text-center max-w-sm">
                    Reading filings text, auditing figures, dividends recommendations, or commercial win details factually.
                  </p>
                </div>
              ) : (
                <div className="prose prose-invert prose-xs max-w-none">
                  <div className="whitespace-pre-line leading-relaxed text-[11px] font-sans font-medium text-zinc-300">
                    {aiSummary}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-zinc-950/60 border-t border-zinc-800/80 flex items-center justify-between text-[9px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-emerald-500" />
                Zero-Fabrication Guard Enabled
              </span>
              <div className="flex items-center gap-2 font-mono">
                {selectedFiling.pdfUrl && (
                  <button
                    onClick={() => window.open(selectedFiling.pdfUrl!, '_blank')}
                    className="flex items-center gap-1 px-3.5 py-2 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-bold cursor-pointer text-[9px]"
                  >
                    View Original Exchange PDF
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setSummaryModalOpen(false)}
                  className="px-3.5 py-2 rounded bg-zinc-850 hover:bg-zinc-800 text-zinc-300 font-bold cursor-pointer text-[9px]"
                >
                  Close Analysis
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
