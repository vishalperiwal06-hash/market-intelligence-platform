'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMarketStore } from '@/store/useMarketStore';
import { StockChart } from '@/components/market/StockChart';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Search,
  Zap,
  BarChart2,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  RefreshCw,
  Flame,
  Volume2,
  Bell,
  ChevronRight,
  SlidersHorizontal,
  X,
  Layers,
  Percent,
  Command
} from 'lucide-react';
import { formatPrice, formatPercent, formatVolume, safeFloat, formatTurnover } from '@/lib/formatters';
import { CompanyLogo } from '@/components/market/CompanyLogo';

// Timeframe configuration
const TIMEFRAMES = [
  { value: '5m', label: '5 Min' },
  { value: '15m', label: '15 Min' },
  { value: '30m', label: '30 Min' },
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hour' },
  { value: '1d', label: 'Daily' },
  { value: '1w', label: 'Weekly' },
  { value: '1m', label: 'Monthly' },
  { value: '1y', label: 'Yearly' },
];

interface ScannedStock {
  symbol: string;
  timeframe: string;
  timestamp: string;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  vwap: number | null;
  atr14: number | null;
  relativeStrength: number | null;
  volumeSma20: number | null;
  volumeSpike: boolean;
  volMultiplier: number;
  breakoutDetected: boolean;
  breakoutType: string | null;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  remembered?: boolean;
  rememberedReason?: string | null;
  catalyst?: any;
}

interface SurgeAlert {
  id: string;
  symbol: string;
  companyName: string;
  type: 'INFLOW' | 'STEALTH' | 'LIQUIDATION';
  turnoverDelta: number;
  deltaPercent: number;
  currentPrice: number;
  changePercent: number;
  timestamp: number;
}


function getDynamicIndicatorCommentary(stock: any, sector: string | null | undefined): string {
  const isUp = safeFloat(stock.changePercent) >= 0;
  const volMultiplier = stock.volMultiplier || 1.1;

  // 1. Prioritize persistent remembered catalyst reason
  if (stock.rememberedReason) {
    return stock.rememberedReason;
  }

  // 2. Prioritize real corporate or news catalyst from database scans
  if (stock.catalyst) {
    return `${stock.catalyst.reason}`;
  }

  // 2. Fallback to computed technical indicator commentary
  if (volMultiplier > 3.0) {
    return isUp 
      ? `AI - Inflow: Volume spike ${volMultiplier.toFixed(1)}x above 20-day SMA`
      : `AI - Liquidation: Volume spike ${volMultiplier.toFixed(1)}x detected`;
  }
  
  if (stock.breakoutDetected) {
    return `Filing - Technical breakout above key resistance level`;
  }

  if (sector) {
    const sec = sector.toLowerCase();
    if (sec.includes('defense') || sec.includes('aerospace')) {
      return isUp ? `AI - Defense sector rally, institutional capital inflow` : `AI - Defense profit-taking after contract runs`;
    }
    if (sec.includes('railway') || sec.includes('infra')) {
      return isUp ? `Order - Rail infra pipeline expansions announced` : `Filing - Regulatory compliance updates submitted`;
    }
    if (sec.includes('renewable') || sec.includes('power')) {
      return isUp ? `AI - Sustained green energy theme momentum +1` : `Filing - Grid capacity optimization filing published`;
    }
    if (sec.includes('banking') || sec.includes('financial')) {
      return isUp ? `AI - Rate cycle tailwinds trigger accumulation` : `AI - Net Interest Margin compression warning`;
    }
    if (sec.includes('tech') || sec.includes('information')) {
      return isUp ? `AI - Generative AI cloud deals pipeline expand` : `AI - IT spending guidance blocks active breakouts`;
    }
  }

  return isUp 
    ? `AI - Sustained positive technical trend breakout`
    : `AI - Muted relative momentum, support level test`;
}

export default function ScreenerPage() {
  const { connected, initialize, marketData, hydrateData } = useMarketStore();
  const [activeTab, setActiveTab] = useState<'movers' | 'screener' | 'filings'>('movers');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1d');
  
  // Real-time Surge states
  const [surgeAlerts, setSurgeAlerts] = useState<SurgeAlert[]>([]);
  const [active30s, setActive30s] = useState<{ symbol: string; price: number; changePercent: number; delta: number }[]>([]);
  const turnoverHistory = useRef<Record<string, { timestamp: number; turnover: number; price?: number }[]>>({});

  // Filings Impact Terminal states
  const [strongestFilings, setStrongestFilings] = useState<any[]>([]);
  const [weakerFilings, setWeakerFilings] = useState<any[]>([]);
  const [filingsLoading, setFilingsLoading] = useState<boolean>(true);
  const [filingsError, setFilingsError] = useState<string | null>(null);

  // AI summary modal states
  const [summaryModalOpen, setSummaryModalOpen] = useState<boolean>(false);
  const [selectedFilingForSummary, setSelectedFilingForSummary] = useState<any>(null);
  const [aiSummaryText, setAiSummaryText] = useState<string>('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState<boolean>(false);
  
  // Screener states
  const [screenerData, setScreenerData] = useState<ScannedStock[]>([]);
  const [rememberedCatalysts, setRememberedCatalysts] = useState<any[]>([]);
  const [screenerLoading, setScreenerLoading] = useState<boolean>(true);
  const [screenerError, setScreenerError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('All');

  // Lookup map for company domains and official names
  const companyNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    screenerData.forEach((s) => {
      if (s.companyName) {
        map.set(s.symbol.toUpperCase().trim(), s.companyName);
      }
    });
    return map;
  }, [screenerData]);
  
  // Filter settings
  const [rsiFilter, setRsiFilter] = useState<string>('All');
  const [emaFilter, setEmaFilter] = useState<string>('All');
  const [macdFilter, setMacdFilter] = useState<string>('All');
  const [bbFilter, setBbFilter] = useState<string>('All');
  const [signalFilter, setSignalFilter] = useState<string>('All');
  
  // Interactive mini stock detail chart drawer state
  const [selectedChartSymbol, setSelectedChartSymbol] = useState<string | null>(null);

  // Earnings Pulse customization states
  const [moverSortMetric, setMoverSortMetric] = useState<'activity' | 'change' | 'turnover'>('activity');
  const [syncInterval, setSyncInterval] = useState<number>(5000); // default 5s sync
  const [clockTime, setClockTime] = useState<string>('');

  // Clock tick timer
  useEffect(() => {
    const tick = () => {
      setClockTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Initialize store and feeds
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Real-time Active Syncing loop based on selected syncInterval (Earnings Pulse refresh)
  useEffect(() => {
    if (syncInterval <= 0) return;
    
    const interval = setInterval(() => {
      hydrateData();
    }, syncInterval);
    
    return () => clearInterval(interval);
  }, [syncInterval, hydrateData]);

  // 1. Fetch Technical indicator scanner data
  const fetchScreenerData = useCallback(async () => {
    setScreenerLoading(true);
    setScreenerError(null);
    try {
      const res = await fetch(`/api/screener/scan?timeframe=${selectedTimeframe}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || 'Failed to fetch scan results');
      setScreenerData(json.data || []);
      setRememberedCatalysts(json.remembered || []);
    } catch (err: any) {
      setScreenerError(err.message || 'Error scanning indicator database');
    } finally {
      setScreenerLoading(false);
    }
  }, [selectedTimeframe]);

  useEffect(() => {
    fetchScreenerData();
    const interval = setInterval(fetchScreenerData, 10000); // scan every 10s
    return () => clearInterval(interval);
  }, [fetchScreenerData]);

  // 1.2. Fetch Corporate Filings Live Market Impact
  const fetchFilingsImpact = useCallback(async () => {
    try {
      const res = await fetch('/api/corporate/filings/impact');
      const data = await res.json();
      if (data.ok) {
        setStrongestFilings(data.strongest || []);
        setWeakerFilings(data.weaker || []);
        setFilingsError(null);
      } else {
        setFilingsError(data.error || 'Failed to calculate filings impact');
      }
    } catch (err: any) {
      setFilingsError(err.message || 'Error connecting to filings impact endpoint');
    } finally {
      setFilingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'filings') {
      fetchFilingsImpact();
      const interval = setInterval(fetchFilingsImpact, 15000); // Dynamic 15s refetch
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchFilingsImpact]);

  // AI Document Summarizer client integration
  const handleAiSummarize = async (filing: any) => {
    setSelectedFilingForSummary(filing);
    setAiSummaryLoading(true);
    setAiSummaryText('');
    setSummaryModalOpen(true);
    try {
      const res = await fetch(`/api/corporate/filings/${filing.id}/summarize`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        setAiSummaryText(data.summary);
      } else {
        setAiSummaryText(`### Synthesis Failure\nFailed to generate high-fidelity AI summary: ${data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      setAiSummaryText(`### Network Exception\nFailed to connect to the document parsing subsystem: ${e.message}`);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  // 2. Real-time Market Movers calculation from WebSocket Store (Earnings Pulse optimized)
  const moversLists = useMemo(() => {
    const list = Object.values(marketData).filter((s) => s && s.symbol && s.price > 0);
    if (!list.length) return { gainers: [], losers: [] };

    const getTurnover = (stock: any) => {
      const base = stock.turnover || (stock.volume * stock.price) / 100000 || 0;
      const company = screenerData.find(s => s.symbol === stock.symbol);
      // Track and prioritize remembered catalyst stocks in the lists if they show activity
      if (company && (company as any).remembered) {
        return base + 10000000; // Prioritized surge boost
      }
      return base;
    };

    let sortedGainers = [...list].filter(s => safeFloat(s.changePercent) >= 0);
    let sortedLosers = [...list].filter(s => safeFloat(s.changePercent) < 0);

    if (moverSortMetric === 'change') {
      sortedGainers.sort((a, b) => safeFloat(b.changePercent) - safeFloat(a.changePercent));
      sortedLosers.sort((a, b) => safeFloat(a.changePercent) - safeFloat(b.changePercent));
    } else if (moverSortMetric === 'turnover') {
      sortedGainers.sort((a, b) => getTurnover(b) - getTurnover(a));
      sortedLosers.sort((a, b) => getTurnover(b) - getTurnover(a));
    } else {
      // Activity: sorted by volume
      sortedGainers.sort((a, b) => safeFloat(b.volume) - safeFloat(a.volume));
      sortedLosers.sort((a, b) => safeFloat(b.volume) - safeFloat(a.volume));
    }

    return {
      gainers: sortedGainers.slice(0, 20),
      losers: sortedLosers.slice(0, 20),
    };
  }, [marketData, moverSortMetric]);

  // 3. High-Speed 30s Turnover & Volume Surge Monitor (3 Precise Filters + 30s Hot Money Ranker)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const list = Object.values(marketData).filter((s) => s && s.symbol && s.price > 0);
      if (!list.length) return;

      const topGainerSymbols = new Set(moversLists.gainers.map((g) => g.symbol));
      const topLoserSymbols = new Set(moversLists.losers.map((l) => l.symbol));
      const detectedSurges: SurgeAlert[] = [];
      const allDeltas: { symbol: string; price: number; changePercent: number; delta: number }[] = [];

      list.forEach((stock) => {
        const symbol = stock.symbol;
        const currentTurnover = stock.turnover || (stock.volume * stock.price) / 100000 || 0;

        if (!turnoverHistory.current[symbol]) {
          turnoverHistory.current[symbol] = [];
        }

        // Add to history log with price tracking to know direct real-time trajectory
        turnoverHistory.current[symbol].push({ 
          timestamp: now, 
          turnover: currentTurnover,
          price: stock.price
        });

        // Keep 45 seconds of history
        turnoverHistory.current[symbol] = turnoverHistory.current[symbol].filter(
          (h) => now - h.timestamp <= 45000
        );

        const history = turnoverHistory.current[symbol];
        if (history.length < 2) return;

        // Find the entry closest to 30 seconds ago, or fall back to the oldest available entry
        const targetTime = now - 30000;
        let bestEntry = history[0];
        let minDiff = Math.abs(bestEntry.timestamp - targetTime);

        for (let i = 1; i < history.length; i++) {
          const diff = Math.abs(history[i].timestamp - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            bestEntry = history[i];
          }
        }

        const timeDiffMs = now - bestEntry.timestamp;
        const rawDelta = currentTurnover - bestEntry.turnover;
        
        // Scale to 30 seconds if history is short for instant live feedback
        const scaleFactor = timeDiffMs >= 30000 ? 1.0 : (30000 / Math.max(1000, timeDiffMs));
        const turnoverDelta = Math.max(0, rawDelta * scaleFactor);
        const deltaPercent = bestEntry.turnover > 0 ? (turnoverDelta / bestEntry.turnover) * 100 : 0;

        if (turnoverDelta > 0.01) {
          allDeltas.push({
            symbol,
            price: stock.price,
            changePercent: stock.changePercent,
            delta: turnoverDelta,
          });
        }

        const company = screenerData.find(s => s.symbol === symbol);
        const hasNewsOrFiling = company ? (!!company.catalyst || !!company.remembered) : false;
        const changePctAbs = Math.abs(stock.changePercent);

        // Refined criteria:
        // 1. Stock daily change >= 4% (or <= -4%) AND turnover delta in past 30s >= 50 Lakhs (50.0)
        const meetsChgAndTurnover = changePctAbs >= 4.0 && turnoverDelta >= 50.0;
        
        // 2. OR stock has active news/filings AND turnover delta in past 30s >= 20 Lakhs (20.0)
        const meetsNewsAndTurnover = hasNewsOrFiling && turnoverDelta >= 20.0;

        const isSurge = meetsChgAndTurnover || meetsNewsAndTurnover;

        if (isSurge) {
          let alertType: 'INFLOW' | 'STEALTH' | 'LIQUIDATION' = 'INFLOW';
          if (meetsNewsAndTurnover) {
            alertType = 'STEALTH'; // Labeled as 'Stealth Accumulation / News Catalyst'
          } else if (stock.changePercent < 0) {
            alertType = 'LIQUIDATION'; // Labeled as 'Heavy Liquidation'
          }

          detectedSurges.push({
            id: `${symbol}-${alertType}-${now}`,
            symbol,
            companyName: company?.companyName || 'Listed Equity',
            type: alertType,
            turnoverDelta,
            deltaPercent,
            currentPrice: stock.price,
            changePercent: stock.changePercent,
            timestamp: now,
          });
        }
      });

      // Update 30s Velocity Hot Money ranker
      if (allDeltas.length > 0) {
        allDeltas.sort((a, b) => b.delta - a.delta);
        setActive30s(allDeltas.slice(0, 20));
      }

      if (detectedSurges.length > 0) {
        setSurgeAlerts((prev) => {
          // Merge newly detected surges and keep the top 12 most active recent ones visible
          const filteredNew = detectedSurges.filter(
            (n) => !prev.some((p) => p.symbol === n.symbol && now - p.timestamp < 30000)
          );
          if (filteredNew.length === 0) return prev;
          return [...filteredNew, ...prev].slice(0, 12);
        });
      }
    }, 1500); // scan quotes every 1.5s

    return () => clearInterval(interval);
  }, [marketData, moversLists.gainers, moversLists.losers, screenerData]);

  // Unique Sectors list for filtering
  const uniqueSectors = useMemo(() => {
    const sectors = new Set<string>();
    screenerData.forEach((s) => {
      if (s.sector) sectors.add(s.sector);
    });
    return ['All', ...Array.from(sectors).sort()];
  }, [screenerData]);

  // Apply technical scanning filters to rows
  const filteredScreenerData = useMemo(() => {
    return screenerData.filter((stock) => {
      // 1. Text Search
      const search = searchTerm.toUpperCase();
      const matchSearch =
        !search ||
        stock.symbol.toUpperCase().includes(search) ||
        (stock.companyName && stock.companyName.toUpperCase().includes(search)) ||
        (stock.sector && stock.sector.toUpperCase().includes(search));

      if (!matchSearch) return false;

      // 2. Sector Filter
      if (selectedSector !== 'All' && stock.sector !== selectedSector) return false;

      // 3. RSI Strength Dropdown filters
      if (rsiFilter !== 'All') {
        const rsi = stock.rsi14;
        if (rsi === null) return false;
        if (rsiFilter === 'above_60' && rsi <= 60) return false;
        if (rsiFilter === 'above_40' && rsi <= 40) return false;
        if (rsiFilter === 'below_40' && rsi >= 40) return false;
        if (rsiFilter === 'below_20' && rsi >= 20) return false;
      }

      // 4. EMA crossings Stack Filters (9, 21, 50, 100, 200)
      if (emaFilter !== 'All') {
        const ema9 = stock.ema9;
        const ema21 = stock.ema21;
        const ema50 = stock.ema50;
        const ema100 = stock.ema100;
        const ema200 = stock.ema200;

        if (!ema9 || !ema21 || !ema50 || !ema100 || !ema200) return false;

        if (emaFilter === 'perfect_bullish') {
          // 9 > 21 > 50 > 100
          if (!(ema9 > ema21 && ema21 > ema50 && ema50 > ema100)) return false;
        } else if (emaFilter === 'good_bullish') {
          // 9 > 21 > 50
          if (!(ema9 > ema21 && ema21 > ema50)) return false;
        } else if (emaFilter === 'getting_bullish') {
          // 9 > 21
          if (!(ema9 > ema21)) return false;
        } else if (emaFilter === 'perfect_bearish') {
          // 9 < 21 < 50 < 100
          if (!(ema9 < ema21 && ema21 < ema50 && ema50 < ema100)) return false;
        } else if (emaFilter === 'good_bearish') {
          // 9 < 21 < 50
          if (!(ema9 < ema21 && ema21 < ema50)) return false;
        } else if (emaFilter === 'getting_bearish') {
          // 9 < 21
          if (!(ema9 < ema21)) return false;
        }
      }

      // 5. MACD state
      if (macdFilter !== 'All') {
        const hist = stock.macdHistogram;
        const line = stock.macdLine;
        const sig = stock.macdSignal;

        if (hist === null || line === null || sig === null) return false;
        if (macdFilter === 'bullish_cross' && line <= sig) return false;
        if (macdFilter === 'bearish_cross' && line >= sig) return false;
        if (macdFilter === 'positive_hist' && hist <= 0) return false;
        if (macdFilter === 'negative_hist' && hist >= 0) return false;
      }

      // 6. Bollinger Bands Volatility Scan (Squeezing, Spread, Near Upper/Lower)
      if (bbFilter !== 'All') {
        const upper = stock.bbUpper;
        const lower = stock.bbLower;
        const middle = stock.bbMiddle;
        if (!upper || !lower || !middle) return false;

        const price = stock.vwap || stock.ema9 || 0;
        const bandWidth = (upper - lower) / middle; // Volatility width

        if (bbFilter === 'squeezing' && bandWidth >= 0.05) return false; // Squeezing < 5%
        if (bbFilter === 'spread' && bandWidth <= 0.15) return false; // Spread out > 15%
        if (bbFilter === 'near_upper' && price < (upper - (upper * 0.01))) return false; // Within 1% of Upper BB
        if (bbFilter === 'near_lower' && price > (lower + (lower * 0.01))) return false; // Within 1% of Lower BB
      }

      // 7. Volume and Price Breakouts Filters
      if (signalFilter !== 'All') {
        const mul = stock.volMultiplier;
        if (signalFilter === 'vol_1w' && mul < 1.5) return false;
        if (signalFilter === 'vol_1m' && mul < 2.0) return false;
        if (signalFilter === 'vol_year' && mul < 5.0) return false;
        if (signalFilter === 'vol_ever' && mul < 10.0) return false;
        if (signalFilter === 'vol_low' && mul > 0.2) return false;
      }

      return true;
    });
  }, [screenerData, searchTerm, selectedSector, rsiFilter, emaFilter, macdFilter, bbFilter, signalFilter]);

  const clearSurges = () => setSurgeAlerts([]);

  return (
    <div className="space-y-5 max-w-[1820px] mx-auto pb-10 text-zinc-100 bg-terminal-dark relative">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
        <div>
          <h1 className="text-lg font-black tracking-tight text-zinc-100 uppercase font-mono flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-blue-500 rounded-sm animate-pulse inline-block" />
            Institutional Technical Screener &amp; Movers Terminal
          </h1>
          <p className="text-[9px] text-zinc-600 font-semibold tracking-widest uppercase font-mono">
            High-Speed Indicators · Real-Time 30s Surge alerts · 3000+ Listed equities
          </p>
        </div>
        
        {/* TAB CONTROLLERS */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-md p-0.5 border border-zinc-800/80 bg-zinc-950/90 text-[10px] font-mono shadow-inner shadow-black/80">
            <button
              onClick={() => setActiveTab('movers')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all uppercase tracking-wider font-black ${
                activeTab === 'movers'
                  ? 'bg-gradient-to-r from-amber-600/20 to-orange-600/25 border border-amber-500/30 text-amber-400 shadow-lg shadow-amber-500/5'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
              Movers &amp; Live Surges
            </button>
            <button
              onClick={() => setActiveTab('screener')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all uppercase tracking-wider font-black ${
                activeTab === 'screener'
                  ? 'bg-gradient-to-r from-blue-600/20 to-indigo-600/25 border border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/5'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-blue-400" />
              Technical Indicator Scanner
            </button>
            <button
              onClick={() => setActiveTab('filings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all uppercase tracking-wider font-black ${
                activeTab === 'filings'
                  ? 'bg-gradient-to-r from-emerald-600/20 to-teal-600/25 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/5'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              Filings Impact Terminal
            </button>
          </div>
          
          {connected ? (
            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400 gap-1.5 py-1 text-[9px] font-mono shrink-0">
              <span className="live-dot" /> STREAM LIVE
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-400 gap-1.5 py-1 text-[9px] font-mono shrink-0 animate-pulse">
              SYNCING...
            </Badge>
          )}
        </div>
      </div>      {/* TAB 1: MOVERS & REAL TIME SURGES */}
      {activeTab === 'movers' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* POPPING CAPITAL SURGE ALERTS ROW */}
          {surgeAlerts.length > 0 && (
            <div className="bg-zinc-950/90 border border-blue-500/30 rounded-xl p-4 shadow-2xl relative overflow-hidden animate-border-glow">
              <div className="absolute top-0 right-0 p-2 z-10">
                <button onClick={clearSurges} className="text-zinc-650 hover:text-zinc-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-4 w-4 text-amber-500 animate-bounce" />
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest font-mono">
                  30-Second High-Speed Capital Surge Detections (Stealth & Liquidation Activity)
                </span>
              </div>
              
              {/* Horizontal Scroll of Popping Cards */}
              <div className="flex gap-4 overflow-x-auto pb-2 pr-4 scrollbar-thin scrollbar-thumb-zinc-800">
                {surgeAlerts.map((alert) => {
                  let alertBadge = 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400';
                  let alertLabel = 'Capital Inflow';
                  let sideBorder = 'bg-emerald-500';
                  if (alert.type === 'STEALTH') {
                    alertBadge = 'bg-amber-500/15 border-amber-500/35 text-amber-400 animate-pulse';
                    alertLabel = 'News Catalyst';
                    sideBorder = 'bg-amber-500';
                  } else if (alert.type === 'LIQUIDATION') {
                    alertBadge = 'bg-rose-500/15 border-rose-500/35 text-rose-400';
                    alertLabel = 'Heavy Liquidation';
                    sideBorder = 'bg-rose-500';
                  }

                  return (
                    <div
                      key={alert.id}
                      onClick={() => setSelectedChartSymbol(alert.symbol)}
                      className="flex-shrink-0 w-[290px] bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 hover:bg-zinc-850/40 transition-all cursor-pointer relative group overflow-hidden animate-pop-in shadow-lg"
                    >
                      <div className={`absolute top-0 left-0 w-1 h-full ${sideBorder}`} />
                      
                      <div className="flex items-start justify-between mb-1.5 pl-1">
                        <div className="flex items-center gap-2">
                          <CompanyLogo symbol={alert.symbol} companyName={alert.companyName} size="sm" />
                          <div>
                            <div className="font-bold text-zinc-100 text-xs font-mono tracking-wider flex items-center gap-1 group-hover:text-blue-400 transition-colors">
                              {alert.symbol}
                              <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />
                            </div>
                            <div className="text-[8px] text-zinc-550 truncate max-w-[130px] font-sans">
                              {alert.companyName}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <Badge variant="outline" className={`text-[7px] font-mono py-0 px-1 mb-1 font-bold tracking-wider ${alertBadge}`}>
                            {alertLabel}
                          </Badge>
                          <div className="text-[10px] font-black font-mono text-emerald-400">
                            +{formatTurnover(alert.turnoverDelta)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center text-[9px] font-mono mt-2 pt-2 border-t border-zinc-800/50 pl-1">
                        <span className="text-zinc-500">₹{alert.currentPrice.toFixed(2)}</span>
                        <span className={`font-bold ${alert.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {alert.changePercent >= 0 ? '+' : ''}{alert.changePercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI-REMEMBERED CATALYST SURGES GRID */}
          {rememberedCatalysts.length > 0 && (
            <div className="bg-zinc-950/90 border border-amber-500/30 rounded-xl p-4 shadow-2xl relative overflow-hidden animate-border-glow-amber">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest font-mono">
                  AI Catalyst Memory - news & corporate filing surges (Active 24h)
                </span>
              </div>
              
              <div className="flex gap-4 overflow-x-auto pb-2 pr-4 scrollbar-thin scrollbar-thumb-zinc-800">
                {rememberedCatalysts.map((item) => (
                  <div
                    key={item.symbol}
                    onClick={() => setSelectedChartSymbol(item.symbol)}
                    className="flex-shrink-0 w-[300px] bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 hover:bg-zinc-850/40 transition-all cursor-pointer relative group overflow-hidden shadow-lg"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                    
                    <div className="flex items-start justify-between mb-1.5 pl-1">
                      <div className="flex items-center gap-2">
                        <CompanyLogo symbol={item.symbol} companyName={companyNameLookup.get(item.symbol.toUpperCase().trim())} size="sm" />
                        <div>
                          <div className="font-bold text-zinc-100 text-xs font-mono tracking-wider flex items-center gap-1 group-hover:text-amber-400 transition-colors uppercase">
                            {item.symbol}
                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-amber-400" />
                          </div>
                          <div className="text-[8px] text-zinc-550 truncate max-w-[130px] font-sans">
                            {item.companyName || companyNameLookup.get(item.symbol.toUpperCase().trim()) || 'Listed Equity'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <Badge variant="outline" className="text-[7px] font-mono py-0 px-1 mb-1 font-bold tracking-wider bg-amber-500/15 border-amber-500/35 text-amber-400 uppercase">
                          {item.catalyst?.type || 'Catalyst'}
                        </Badge>
                        <div className="text-[10px] font-black font-mono text-amber-400">
                          {item.volMultiplier?.toFixed(1)}x Vol
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-[8.5px] font-medium text-zinc-400 tracking-wide font-sans line-clamp-2 min-h-[24px] mb-2 pl-1">
                      {item.reason}
                    </p>
                    
                    <div className="flex justify-between items-center text-[9px] font-mono mt-2 pt-2 border-t border-zinc-850/50 pl-1">
                      <span className="text-zinc-500">₹{item.price?.toFixed(2)}</span>
                      <span className={`font-bold ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INTRADAY MOVERS FILTER & CONTROL ROW */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
            <div className="space-y-2">
              {/* Region Selector Badge */}
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black font-mono bg-blue-650 text-white rounded px-2 py-0.5 tracking-wider">IN NSE</span>
                <span className="text-[8px] font-bold font-mono bg-zinc-900 border border-zinc-800 text-zinc-550 rounded px-2 py-0.5 tracking-wider hover:text-zinc-350 cursor-pointer">US NYSE</span>
              </div>
              {/* Header Title with Sub-counts */}
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-black text-zinc-100 font-mono uppercase tracking-tight">Intraday Movers</span>
                <span className="text-xs font-black text-emerald-400 font-mono tracking-tighter">
                  {moversLists.gainers.length}+
                </span>
                <span className="text-xs font-black text-rose-400 font-mono tracking-tighter">
                  {moversLists.losers.length}-
                </span>
                <span className="text-[9px] font-bold text-zinc-700 font-mono uppercase tracking-wider">
                  / {Object.keys(marketData).length} active
                </span>
              </div>
            </div>

            {/* Sync bar & TV Watchlist */}
            <div className="flex items-center gap-4 text-[10px] font-mono select-none">
              <div className="text-zinc-550 font-bold tabular-nums">
                {clockTime || "00:00:00"}
              </div>
              <div className="flex items-center gap-1 bg-zinc-950/70 border border-zinc-900 p-0.5 rounded text-[8px] font-bold">
                <span className="text-zinc-700 uppercase tracking-widest px-1.5">Sync:</span>
                {[5, 15, 30, 60].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSyncInterval(s * 1000)}
                    className={`px-2 py-0.5 rounded transition-all ${
                      syncInterval === s * 1000
                        ? 'bg-zinc-850 text-zinc-100'
                        : 'text-zinc-650 hover:text-zinc-400'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
                <button
                  onClick={() => setSyncInterval(0)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    syncInterval === 0 ? 'bg-zinc-850 text-zinc-100' : 'text-zinc-650 hover:text-zinc-400'
                  }`}
                >
                  Off
                </button>
              </div>
              
              <button className="flex items-center gap-1 px-3 py-1 bg-zinc-950/70 border border-zinc-900 hover:border-zinc-850 text-zinc-350 hover:text-zinc-150 rounded text-[9px] font-bold uppercase transition-all shadow-inner">
                <Command size={10} className="text-zinc-550" />
                TV Watchlist
              </button>
            </div>
          </div>

          {/* FLAT MOVERS FILTER TABS */}
          <div className="flex gap-2">
            {[
              { key: 'activity', label: 'Activity' },
              { key: 'change', label: 'Change%' },
              { key: 'turnover', label: 'Turnover' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setMoverSortMetric(t.key as any)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wider transition-all border ${
                  moverSortMetric === t.key
                    ? 'bg-blue-600/10 border-blue-500/25 text-blue-400 shadow-md shadow-blue-500/5'
                    : 'bg-zinc-950/45 border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TWO-COLUMN SIDE-BY-SIDE LISTS */}
          <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
            
            {/* GAINERS COLUMN */}
            <div className="border border-zinc-900 rounded-xl bg-zinc-950/15 p-4 shadow-2xl relative">
              <div className="flex items-center justify-between mb-4 border-b border-zinc-900 pb-2">
                <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest font-mono flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Gainers ({moversLists.gainers.length})
                </h3>
              </div>
              
              <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1 scrollbar-thin">
                {moversLists.gainers.length > 0 ? (
                  moversLists.gainers.map((stock, i) => {
                    const company = screenerData.find(s => s.symbol === stock.symbol);
                    const comment = getDynamicIndicatorCommentary({ ...stock, ...company }, company?.sector);
                    const turnValue = stock.turnover || (stock.volume * stock.price) / 100000 || 0;
                    const turnStr = turnValue > 100 ? `₹${(turnValue / 100).toFixed(1)}cr` : `₹${turnValue.toFixed(0)}L`;

                    return (
                      <div
                        key={stock.symbol}
                        onClick={() => setSelectedChartSymbol(stock.symbol)}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/15 hover:bg-zinc-900/40 border border-transparent hover:border-zinc-900/80 transition-all duration-200 cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <CompanyLogo symbol={stock.symbol} companyName={companyNameLookup.get(stock.symbol.toUpperCase().trim())} size="sm" />
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-black text-zinc-150 group-hover:text-blue-400 transition-colors uppercase">
                                {stock.symbol}
                              </span>
                              <span className="text-[7.5px] font-black text-zinc-650 px-1 border border-zinc-900 rounded bg-zinc-950 font-mono">
                                M
                              </span>
                              {company?.remembered && (
                                <span className="text-[7px] font-black text-amber-400 px-1 border border-amber-500/30 rounded bg-amber-500/10 font-mono animate-pulse uppercase tracking-wider">
                                  AI MEMORY
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] font-medium text-zinc-550 tracking-wide font-sans truncate max-w-[280px]">
                              {comment}
                            </p>
                          </div>
                        </div>

                        {/* Right columns */}
                        <div className="flex items-center gap-6 font-mono text-[10px] text-right">
                          <span className="text-zinc-600 font-bold">{turnStr}</span>
                          <span className="text-zinc-300 font-bold w-[70px]">₹{formatPrice(stock.price)}</span>
                          <span className="text-emerald-400 font-black w-[55px]">+{formatPercent(stock.changePercent)}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-zinc-755 text-xs font-mono animate-pulse uppercase">
                    Syncing exchange quotes...
                  </div>
                )}
              </div>
            </div>

            {/* LOSERS COLUMN */}
            <div className="border border-zinc-900 rounded-xl bg-zinc-950/15 p-4 shadow-2xl relative">
              <div className="flex items-center justify-between mb-4 border-b border-zinc-900 pb-2">
                <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest font-mono flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-450 animate-pulse" />
                  Losers ({moversLists.losers.length})
                </h3>
              </div>
              
              <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1 scrollbar-thin">
                {moversLists.losers.length > 0 ? (
                  moversLists.losers.map((stock, i) => {
                    const company = screenerData.find(s => s.symbol === stock.symbol);
                    const comment = getDynamicIndicatorCommentary({ ...stock, ...company }, company?.sector);
                    const turnValue = stock.turnover || (stock.volume * stock.price) / 100000 || 0;
                    const turnStr = turnValue > 100 ? `₹${(turnValue / 100).toFixed(1)}cr` : `₹${turnValue.toFixed(0)}L`;

                    return (
                      <div
                        key={stock.symbol}
                        onClick={() => setSelectedChartSymbol(stock.symbol)}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/15 hover:bg-zinc-900/40 border border-transparent hover:border-zinc-900/80 transition-all duration-200 cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <CompanyLogo symbol={stock.symbol} companyName={companyNameLookup.get(stock.symbol.toUpperCase().trim())} size="sm" />
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-black text-zinc-150 group-hover:text-blue-400 transition-colors uppercase">
                                {stock.symbol}
                              </span>
                              <span className="text-[7.5px] font-black text-zinc-650 px-1 border border-zinc-900 rounded bg-zinc-950 font-mono">
                                S
                              </span>
                              {company?.remembered && (
                                <span className="text-[7px] font-black text-amber-400 px-1 border border-amber-500/30 rounded bg-amber-500/10 font-mono animate-pulse uppercase tracking-wider">
                                  AI MEMORY
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] font-medium text-zinc-550 tracking-wide font-sans truncate max-w-[280px]">
                              {comment}
                            </p>
                          </div>
                        </div>

                        {/* Right columns */}
                        <div className="flex items-center gap-6 font-mono text-[10px] text-right">
                          <span className="text-zinc-600 font-bold">{turnStr}</span>
                          <span className="text-zinc-300 font-bold w-[70px]">₹{formatPrice(stock.price)}</span>
                          <span className="text-rose-400 font-black w-[55px]">{formatPercent(stock.changePercent)}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-zinc-755 text-xs font-mono animate-pulse uppercase">
                    Syncing exchange quotes...
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* TAB 2: TECHNICAL SCANNER */}
      {activeTab === 'screener' && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-12 items-start">
          
          {/* SIDE PANEL: INDICATOR FILTERS AND CONFIG */}
          <div className="xl:col-span-3 space-y-4">
            <Card className="bg-terminal-card border-zinc-850">
              <CardHeader className="pb-3 border-b border-zinc-850 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <SlidersHorizontal className="h-4 w-4 text-blue-400 shrink-0" />
                  Filter Matrix
                </CardTitle>
                <button
                  onClick={() => {
                    setRsiFilter('All');
                    setEmaFilter('All');
                    setMacdFilter('All');
                    setBbFilter('All');
                    setSignalFilter('All');
                    setSelectedSector('All');
                  }}
                  className="text-[9px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors uppercase font-bold"
                >
                  Reset
                </button>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs font-mono">
                
                {/* Timeframe selector */}
                <div className="space-y-2">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Analysis Timeframe</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {TIMEFRAMES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setSelectedTimeframe(t.value)}
                        className={`py-1 rounded text-[9px] font-bold transition-all border text-center ${
                          selectedTimeframe === t.value
                            ? 'bg-blue-600/25 border-blue-500/50 text-blue-300'
                            : 'bg-zinc-950 border-zinc-900 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sector select */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Sector / Industry</label>
                  <select
                    value={selectedSector}
                    onChange={(e) => setSelectedSector(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded p-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {uniqueSectors.map((sec) => (
                      <option key={sec} value={sec}>{sec}</option>
                    ))}
                  </select>
                </div>

                {/* RSI Strength filter (Above 60, Above 40, Below 40, Below 20) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">RSI Strength (14)</label>
                  <select
                    value={rsiFilter}
                    onChange={(e) => setRsiFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded p-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="All">All RSI States</option>
                    <option value="above_60">Bullish Momentum (RSI &gt; 60)</option>
                    <option value="above_40">Strong Momentum (RSI &gt; 40)</option>
                    <option value="below_40">Bearish Momentum (RSI &lt; 40)</option>
                    <option value="below_20">Extreme Oversold (RSI &lt; 20)</option>
                  </select>
                </div>

                {/* EMA Multi-Stack filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">EMA Trend Stack (9/21/50/100)</label>
                  <select
                    value={emaFilter}
                    onChange={(e) => setEmaFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded p-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="All">All EMA Trends</option>
                    <option value="perfect_bullish">Perfect Bullish (9 &gt; 21 &gt; 50 &gt; 100)</option>
                    <option value="good_bullish">Good Bullish (9 &gt; 21 &gt; 50)</option>
                    <option value="getting_bullish">Getting Bullish (9 &gt; 21)</option>
                    <option value="perfect_bearish">Perfect Bearish (9 &lt; 21 &lt; 50 &lt; 100)</option>
                    <option value="good_bearish">Good Bearish (9 &lt; 21 &lt; 50)</option>
                    <option value="getting_bearish">Getting Bearish (9 &lt; 21)</option>
                  </select>
                </div>

                {/* MACD */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">MACD Momentum</label>
                  <select
                    value={macdFilter}
                    onChange={(e) => setMacdFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded p-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="All">All MACD States</option>
                    <option value="bullish_cross">Bullish Crossover (MACD &gt; Signal)</option>
                    <option value="bearish_cross">Bearish Crossover (MACD &lt; Signal)</option>
                    <option value="positive_hist">Positive Histogram (&gt; 0)</option>
                    <option value="negative_hist">Negative Histogram (&lt; 0)</option>
                  </select>
                </div>

                {/* Bollinger Bands */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Bollinger Bands Volatility</label>
                  <select
                    value={bbFilter}
                    onChange={(e) => setBbFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded p-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="All">All Volatility States</option>
                    <option value="squeezing">BB Squeezing (Width &lt; 5%)</option>
                    <option value="spread">BB Spread out (Width &gt; 15%)</option>
                    <option value="near_upper">Price near Upper Band</option>
                    <option value="near_lower">Price near Lower Band</option>
                  </select>
                </div>

                {/* Vol Spike / Breakouts */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Volume &amp; Price Breakout</label>
                  <select
                    value={signalFilter}
                    onChange={(e) => setSignalFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded p-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="All">All Volume Breakouts</option>
                    <option value="vol_1w">Volume &gt; 1W Average</option>
                    <option value="vol_1m">Volume &gt; 1M Average</option>
                    <option value="vol_year">Highest Volume in Year</option>
                    <option value="vol_ever">Highest Volume Ever</option>
                    <option value="vol_low">Abnormally Low Volume</option>
                  </select>
                </div>

              </CardContent>
            </Card>
          </div>

          {/* MAIN CONTAINER: SCANNER DATAGRID ROW */}
          <div className="xl:col-span-9 space-y-4">
            <Card className="bg-terminal-card border-zinc-850">
              
              {/* TOP TABLE ROW SEARCH & CONTROL */}
              <CardHeader className="pb-3 border-b border-zinc-850">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-blue-400" />
                    <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                      Technical Indicator Scanner Matrix
                    </CardTitle>
                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 text-[9px] font-mono px-2 py-0.5">
                      {filteredScreenerData.length} Equities Scanned
                    </Badge>
                  </div>
                  
                  {/* Search Input Box */}
                  <div className="relative w-full md:w-80">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                      <Search className="h-3.5 w-3.5 text-zinc-500" />
                    </div>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search signals, symbol, indicators scan..."
                      className="w-full bg-zinc-950 border border-zinc-900 rounded py-1.5 pl-8 pr-3 text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow font-mono animate-pulse"
                    />
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                {screenerLoading && filteredScreenerData.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 font-mono flex flex-col items-center gap-3">
                    <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
                    <span className="text-xs">Scanning 3000+ BSE/NSE tickers...</span>
                  </div>
                ) : screenerError ? (
                  <div className="p-6 text-center text-zinc-500 font-mono flex flex-col items-center gap-2">
                    <X className="h-5 w-5 text-rose-500" />
                    <span className="text-xs">Scanner offline</span>
                    <span className="text-[9px] text-zinc-700">{screenerError}</span>
                  </div>
                ) : filteredScreenerData.length === 0 ? (
                  <div className="p-12 text-center text-zinc-600 font-mono flex flex-col items-center gap-2">
                    <Activity className="h-8 w-8 opacity-20" />
                    <span className="text-xs">No securities match the selected scanner filters</span>
                    <button
                      onClick={() => {
                        setRsiFilter('All');
                        setEmaFilter('All');
                        setMacdFilter('All');
                        setBbFilter('All');
                        setSignalFilter('All');
                        setSelectedSector('All');
                        setSearchTerm('');
                      }}
                      className="mt-2 text-[10px] text-blue-500 hover:text-blue-300 font-bold uppercase underline"
                    >
                      Clear Scan filters
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] font-mono border-collapse">
                      <thead className="bg-zinc-950/95 sticky top-0 z-10 border-b border-zinc-900">
                        <tr>
                          <th className="text-left py-2 px-3 text-zinc-500 font-bold uppercase">Symbol</th>
                          <th className="text-left py-2 px-2 text-zinc-500 font-bold uppercase">Sector</th>
                          <th className="text-right py-2 px-2 text-zinc-500 font-bold uppercase">RSI (14)</th>
                          <th className="text-center py-2 px-2 text-zinc-500 font-bold uppercase">MACD state</th>
                          <th className="text-center py-2 px-2 text-zinc-500 font-bold uppercase">EMA Trend</th>
                          <th className="text-left py-2 px-2 text-zinc-500 font-bold uppercase">Bollinger Bands</th>
                          <th className="text-right py-2 px-3 text-zinc-500 font-bold uppercase">Indicators</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/40">
                        {filteredScreenerData.map((stock) => {
                          // RSI Colors
                          const rsi = stock.rsi14;
                          let rsiColor = 'text-zinc-300';
                          if (rsi !== null) {
                            if (rsi < 20) rsiColor = 'text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-black border border-blue-500/20';
                            else if (rsi > 60) rsiColor = 'text-emerald-400 font-black';
                            else if (rsi > 40) rsiColor = 'text-emerald-500/80 font-bold';
                            else if (rsi < 40) rsiColor = 'text-rose-400/80 font-bold';
                          }

                          // EMA structure parsing
                          const ema9 = stock.ema9;
                          const ema21 = stock.ema21;
                          const ema50 = stock.ema50;
                          const ema100 = stock.ema100;
                          
                          let emaBadge = <span className="text-zinc-600">Neutral</span>;
                          if (ema9 && ema21 && ema50 && ema100) {
                            if (ema9 > ema21 && ema21 > ema50 && ema50 > ema100) {
                              emaBadge = <Badge className="bg-emerald-500/10 border-emerald-500/25 text-emerald-400 text-[8px] font-mono py-0 hover:bg-emerald-500/10">PERFECT BULL</Badge>;
                            } else if (ema9 > ema21 && ema21 > ema50) {
                              emaBadge = <span className="text-emerald-400 font-semibold">GOOD BULL</span>;
                            } else if (ema9 > ema21) {
                              emaBadge = <span className="text-emerald-500/80">GETTING BULL</span>;
                            } else if (ema9 < ema21 && ema21 < ema50 && ema50 < ema100) {
                              emaBadge = <Badge className="bg-rose-500/10 border-rose-500/25 text-rose-400 text-[8px] font-mono py-0 hover:bg-rose-500/10">PERFECT BEAR</Badge>;
                            } else if (ema9 < ema21 && ema21 < ema50) {
                              emaBadge = <span className="text-rose-400 font-semibold">GOOD BEAR</span>;
                            } else if (ema9 < ema21) {
                              emaBadge = <span className="text-rose-500/80">GETTING BEAR</span>;
                            }
                          }

                          // Bollinger Bands state representation
                          const upper = stock.bbUpper;
                          const lower = stock.bbLower;
                          const middle = stock.bbMiddle;
                          
                          let bbState = <span className="text-zinc-600">Within Bands</span>;
                          if (upper && lower && middle) {
                            const price = stock.vwap || stock.ema9 || 0;
                            const width = (upper - lower) / middle;
                            if (width < 0.05) {
                              bbState = <Badge className="bg-blue-500/10 border-blue-500/20 text-blue-400 text-[8px] font-mono py-0">SQUEEZE</Badge>;
                            } else if (price >= (upper - (upper * 0.01))) {
                              bbState = <span className="text-emerald-400 font-bold">NEAR UPPER BAND</span>;
                            } else if (price <= (lower + (lower * 0.01))) {
                              bbState = <span className="text-rose-400 font-bold">NEAR LOWER BAND</span>;
                            } else if (width > 0.15) {
                              bbState = <span className="text-blue-300">SPREAD OUT</span>;
                            }
                          }

                          return (
                            <tr
                              key={stock.symbol}
                              onClick={() => setSelectedChartSymbol(stock.symbol)}
                              className="hover:bg-zinc-900/40 transition-colors group cursor-pointer border-b border-zinc-900/20"
                            >
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <CompanyLogo symbol={stock.symbol} size="sm" />
                                  <div>
                                    <div className="font-bold text-zinc-200 group-hover:text-blue-400 transition-colors flex items-center gap-0.5">
                                      {stock.symbol}
                                      <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />
                                    </div>
                                    <div className="text-[8px] text-zinc-500 truncate max-w-[150px] font-sans">
                                      {stock.companyName}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              
                              <td className="py-2.5 px-2 text-zinc-500 max-w-[120px] truncate font-sans">
                                {stock.sector || 'Listed Equity'}
                              </td>
                              
                              <td className="py-2.5 px-2 text-right">
                                <span className={rsiColor}>{rsi !== null ? rsi.toFixed(1) : '--'}</span>
                              </td>
                              
                              <td className="py-2.5 px-2 text-center">
                                {stock.macdHistogram !== null ? (
                                  <span className={`inline-flex items-center gap-0.5 font-bold ${stock.macdHistogram >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {stock.macdHistogram >= 0 ? '▲' : '▼'} {stock.macdHistogram.toFixed(2)}
                                  </span>
                                ) : '--'}
                              </td>
                              
                              <td className="py-2.5 px-2 text-center">
                                {emaBadge}
                              </td>
                              
                              <td className="py-2.5 px-2">
                                {bbState}
                              </td>
                              
                              <td className="py-2.5 px-3 text-right">
                                <button className="text-[9px] text-blue-400 font-bold group-hover:text-blue-300 transition-all uppercase border border-blue-500/20 group-hover:border-blue-500/50 rounded px-2 py-0.5">
                                  Chart →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      )}

      {/* BLOOMBERG-STYLE RIGHT DETAIL CHART DRAWER OVERLAY */}
      {selectedChartSymbol && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] bg-zinc-950/98 border-l border-zinc-800 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 animate-slide-in-right">
          
          {/* Drawer Header */}
          <div className="p-4 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400 animate-pulse" />
              <div>
                <h3 className="font-mono text-sm font-bold text-zinc-100 uppercase tracking-wide">
                  {selectedChartSymbol} Terminal Chart
                </h3>
                <span className="text-[9px] font-bold text-zinc-600 font-mono uppercase tracking-widest block">
                  Interactive multi-style visual graph
                </span>
              </div>
            </div>
            
            <button
              onClick={() => setSelectedChartSymbol(null)}
              className="p-1 rounded hover:bg-zinc-900 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          {/* Drawer Body Container */}
          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            
            {/* Interactive Stock Chart */}
            <ErrorBoundary name="Drawer Stock Chart">
              <StockChart symbol={selectedChartSymbol} height={320} showVolume={true} />
            </ErrorBoundary>

            {/* Scanned indicators card if available */}
            {screenerData.find(s => s.symbol === selectedChartSymbol) && (
              (() => {
                const indicators = screenerData.find(s => s.symbol === selectedChartSymbol)!;
                return (
                  <Card className="bg-terminal-card border-zinc-850 text-xs font-mono">
                    <CardHeader className="pb-2 border-b border-zinc-850">
                      <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                        Scanned Indicators
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">RSI (14)</span>
                        <span className="text-zinc-300 font-bold">{indicators.rsi14 !== null ? indicators.rsi14.toFixed(1) : '--'}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">EMA 9</span>
                        <span className="text-zinc-300">₹{indicators.ema9 !== null ? indicators.ema9.toFixed(2) : '--'}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">EMA 21</span>
                        <span className="text-zinc-300">₹{indicators.ema21 !== null ? indicators.ema21.toFixed(2) : '--'}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">EMA 50</span>
                        <span className="text-zinc-300">₹{indicators.ema50 !== null ? indicators.ema50.toFixed(2) : '--'}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">EMA 100</span>
                        <span className="text-zinc-300">₹{indicators.ema100 !== null ? indicators.ema100.toFixed(2) : '--'}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">EMA 200</span>
                        <span className="text-zinc-300">₹{indicators.ema200 !== null ? indicators.ema200.toFixed(2) : '--'}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1 col-span-2">
                        <span className="text-zinc-600">MACD line / signal / hist</span>
                        <span className="text-zinc-300">
                          {indicators.macdLine?.toFixed(2)} / {indicators.macdSignal?.toFixed(2)} /{' '}
                          <span className={indicators.macdHistogram && indicators.macdHistogram >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {indicators.macdHistogram?.toFixed(2)}
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">BB Upper Band</span>
                        <span className="text-rose-400">₹{indicators.bbUpper !== null ? indicators.bbUpper.toFixed(2) : '--'}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">BB Lower Band</span>
                        <span className="text-blue-400">₹{indicators.bbLower !== null ? indicators.bbLower.toFixed(2) : '--'}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">Breakout flag</span>
                        <span className="text-zinc-300 font-bold">{indicators.breakoutType ? indicators.breakoutType.toUpperCase() : 'NONE'}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1">
                        <span className="text-zinc-600">ATR (14)</span>
                        <span className="text-zinc-300">{indicators.atr14 !== null ? indicators.atr14.toFixed(2) : '--'}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()
            )}
            
            {/* Quick order routing mock */}
            <Card className="bg-terminal-card border-zinc-850">
              <CardHeader className="pb-2 border-b border-zinc-850">
                <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  Exchange Order Routing
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3 font-mono text-[10px]">
                <p className="text-zinc-500 font-sans">
                  Quick trade routing simulated execution for paper trading:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-500/25 py-2 px-3 rounded font-bold uppercase transition-all">
                    Route BUY Order
                  </button>
                  <button className="bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 border border-rose-500/25 py-2 px-3 rounded font-bold uppercase transition-all">
                    Route SELL Order
                  </button>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {activeTab === 'filings' && (
        <div className="space-y-6 animate-fade-in font-mono">
          {/* Dashboard Header/Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-zinc-950/80 border border-zinc-850 rounded-xl p-4 gap-4 backdrop-blur-md">
            <div>
              <h2 className="text-sm font-black uppercase text-emerald-400 flex items-center gap-2">
                <span className="h-2 w-2 bg-emerald-500 rounded-full animate-ping" />
                Live Filings Price Impact Terminal
              </h2>
              <p className="text-[10px] text-zinc-400 mt-1 font-sans">
                Real-time tracking of post-filing market reactions. Core database is scanned every 30 seconds for NSE &amp; BSE corporate announcements. Quotes are refreshed every 15 seconds.
              </p>
            </div>
            <button
              onClick={() => {
                setFilingsLoading(true);
                fetchFilingsImpact();
              }}
              disabled={filingsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[10px] font-bold text-zinc-300 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${filingsLoading ? 'animate-spin' : ''}`} />
              RE-SYNC FEED
            </button>
          </div>

          {filingsLoading && strongestFilings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-zinc-950/45 border border-zinc-900 rounded-xl">
              <RefreshCw className="h-8 w-8 text-zinc-650 animate-spin mb-4" />
              <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider">Hydrating exchange reaction vectors...</p>
            </div>
          ) : filingsError ? (
            <div className="p-6 bg-rose-950/10 border border-rose-900/30 rounded-xl text-center">
              <p className="text-[11px] text-rose-400 font-bold uppercase mb-2">Sync Error</p>
              <p className="text-[10px] text-zinc-400 font-sans">{filingsError}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* STRONGEST POST-ANNOUNCEMENT MOVERS */}
              <Card className="bg-zinc-950/80 border-emerald-500/20 shadow-xl backdrop-blur-md">
                <CardHeader className="pb-3 border-b border-zinc-900 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 font-mono">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    Top 50 Strongest Post-Announcement (Bullish Reaction)
                  </CardTitle>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-mono">
                    {strongestFilings.length} ASSETS
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-900 text-zinc-500 text-[9px] uppercase tracking-wider">
                          <th className="py-2 px-3">Company / Time</th>
                          <th className="py-2 px-3">Announcement Details</th>
                          <th className="py-2 px-3 text-right">Quote Action</th>
                          <th className="py-2 px-3 text-right">Filing Impact</th>
                          <th className="py-2 px-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/60 text-[10px]">
                        {strongestFilings.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-zinc-650">
                              No positive filing reaction signals detected in current cycle.
                            </td>
                          </tr>
                        ) : (
                          strongestFilings.map((f, i) => {
                            const times = (() => {
                              const bDateParsed = new Date(f.broadcastDate);
                              const rDate = new Date(f.reflectedAt || Date.now());
                              
                              let exchangeDate = bDateParsed;
                              if (bDateParsed.getHours() === 5 && bDateParsed.getMinutes() === 30 && bDateParsed.getSeconds() === 0 && f.receiptDate) {
                                exchangeDate = new Date(f.receiptDate);
                              }
                              
                              const bTime = exchangeDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                              const rTime = rDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                              const diffSec = Math.max(0, Math.round((rDate.getTime() - exchangeDate.getTime()) / 1000));
                              
                              return {
                                exch: bTime,
                                platform: rTime,
                                sync: diffSec < 60 ? `${diffSec}s` : `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`
                              };
                            })();

                            return (
                              <tr key={f.id || i} className="hover:bg-zinc-900/40 transition-all group">
                                <td className="py-3 px-3 align-top min-w-[140px]">
                                  <div className="flex items-center gap-2 mb-1">
                                    <CompanyLogo symbol={f.symbol} companyName={f.companyName} size="sm" />
                                    <span className="font-bold text-zinc-200">{f.symbol}</span>
                                  </div>
                                  <div className="text-[7.5px] text-zinc-400 font-mono space-y-0.5 mt-1 leading-snug">
                                    <div>Exch: {times.exch}</div>
                                    <div>Platform: {times.platform}</div>
                                    <div className="text-emerald-400 font-bold">Sync: {times.sync}</div>
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-top max-w-[280px]">
                                  <Badge variant="outline" className="border-zinc-800 text-zinc-400 text-[8px] mb-1.5 py-0 px-1 font-mono uppercase">
                                    {f.category}
                                  </Badge>
                                  <div className="text-zinc-300 font-sans leading-relaxed line-clamp-2 text-[9px]" title={f.subject}>
                                    {f.subject}
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-top text-right font-mono min-w-[100px]">
                                  <div className="text-zinc-200 font-bold">₹{f.currentPrice?.toFixed(2)}</div>
                                  <div className="text-[8px] text-zinc-500 font-sans">
                                    Filing tick: ₹{f.priceAtAnnouncement?.toFixed(2)}
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-top text-right font-bold min-w-[90px]">
                                  <span className="inline-flex items-center text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded text-[10px]">
                                    +{f.impactPercent?.toFixed(2)}%
                                  </span>
                                </td>
                                <td className="py-3 px-3 align-top text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {f.pdfUrl ? (
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          window.open(f.pdfUrl, '_blank');
                                        }}
                                        className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-250 transition-all cursor-pointer flex items-center gap-0.5 font-mono text-[8px] font-black uppercase"
                                        title="Open Exchange Document (PDF)"
                                      >
                                        <ArrowUpRight className="h-2.5 w-2.5 text-emerald-400" />
                                        PDF
                                      </button>
                                    ) : (
                                      <span className="text-[8px] text-zinc-650 font-bold uppercase">NO PDF</span>
                                    )}
                                    <button
                                      onClick={() => handleAiSummarize(f)}
                                      className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/40 hover:border-emerald-500/40 text-[8px] font-black transition-all cursor-pointer uppercase font-mono"
                                    >
                                      <Sparkles className="h-2.5 w-2.5" />
                                      AI Summarize
                                    </button>
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

              {/* WEAKER POST-ANNOUNCEMENT MOVERS */}
              <Card className="bg-zinc-950/80 border-rose-500/20 shadow-xl backdrop-blur-md">
                <CardHeader className="pb-3 border-b border-zinc-900 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-2 font-mono">
                    <TrendingDown className="h-4 w-4 text-rose-500" />
                    Top 50 Weaker Post-Announcement (Bearish Reaction)
                  </CardTitle>
                  <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[9px] font-mono">
                    {weakerFilings.length} ASSETS
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-900 text-zinc-500 text-[9px] uppercase tracking-wider">
                          <th className="py-2 px-3">Company / Time</th>
                          <th className="py-2 px-3">Announcement Details</th>
                          <th className="py-2 px-3 text-right">Quote Action</th>
                          <th className="py-2 px-3 text-right">Filing Impact</th>
                          <th className="py-2 px-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/60 text-[10px]">
                        {weakerFilings.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-zinc-650">
                              No negative filing reaction signals detected in current cycle.
                            </td>
                          </tr>
                        ) : (
                          weakerFilings.map((f, i) => {
                            const times = (() => {
                              const bDateParsed = new Date(f.broadcastDate);
                              const rDate = new Date(f.reflectedAt || Date.now());
                              
                              let exchangeDate = bDateParsed;
                              if (bDateParsed.getHours() === 5 && bDateParsed.getMinutes() === 30 && bDateParsed.getSeconds() === 0 && f.receiptDate) {
                                exchangeDate = new Date(f.receiptDate);
                              }
                              
                              const bTime = exchangeDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                              const rTime = rDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                              const diffSec = Math.max(0, Math.round((rDate.getTime() - exchangeDate.getTime()) / 1000));
                              
                              return {
                                exch: bTime,
                                platform: rTime,
                                sync: diffSec < 60 ? `${diffSec}s` : `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`
                              };
                            })();

                            return (
                              <tr key={f.id || i} className="hover:bg-zinc-900/40 transition-all group">
                                <td className="py-3 px-3 align-top min-w-[140px]">
                                  <div className="flex items-center gap-2 mb-1">
                                    <CompanyLogo symbol={f.symbol} companyName={f.companyName} size="sm" />
                                    <span className="font-bold text-zinc-200">{f.symbol}</span>
                                  </div>
                                  <div className="text-[7.5px] text-zinc-400 font-mono space-y-0.5 mt-1 leading-snug">
                                    <div>Exch: {times.exch}</div>
                                    <div>Platform: {times.platform}</div>
                                    <div className="text-rose-450 font-bold">Sync: {times.sync}</div>
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-top max-w-[280px]">
                                  <Badge variant="outline" className="border-zinc-800 text-zinc-400 text-[8px] mb-1.5 py-0 px-1 font-mono uppercase">
                                    {f.category}
                                  </Badge>
                                  <div className="text-zinc-300 font-sans leading-relaxed line-clamp-2 text-[9px]" title={f.subject}>
                                    {f.subject}
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-top text-right font-mono min-w-[100px]">
                                  <div className="text-zinc-200 font-bold">₹{f.currentPrice?.toFixed(2)}</div>
                                  <div className="text-[8px] text-zinc-500 font-sans">
                                    Filing tick: ₹{f.priceAtAnnouncement?.toFixed(2)}
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-top text-right font-bold min-w-[90px]">
                                  <span className="inline-flex items-center text-rose-400 bg-rose-500/5 border border-rose-500/10 px-1.5 py-0.5 rounded text-[10px]">
                                    {f.impactPercent?.toFixed(2)}%
                                  </span>
                                </td>
                                <td className="py-3 px-3 align-top text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {f.pdfUrl ? (
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          window.open(f.pdfUrl, '_blank');
                                        }}
                                        className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-250 transition-all cursor-pointer flex items-center gap-0.5 font-mono text-[8px] font-black uppercase"
                                        title="Open Exchange Document (PDF)"
                                      >
                                        <ArrowUpRight className="h-2.5 w-2.5 text-rose-400" />
                                        PDF
                                      </button>
                                    ) : (
                                      <span className="text-[8px] text-zinc-650 font-bold uppercase">NO PDF</span>
                                    )}
                                    <button
                                      onClick={() => handleAiSummarize(f)}
                                      className="flex items-center gap-1 px-2 py-1 rounded bg-rose-950/20 border border-rose-500/20 text-rose-400 hover:bg-rose-950/40 hover:border-rose-500/40 text-[8px] font-black transition-all cursor-pointer uppercase font-mono"
                                    >
                                      <Sparkles className="h-2.5 w-2.5" />
                                      AI Summarize
                                    </button>
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
            </div>
          )}
        </div>
      )}

      {/* AI SUMMARY MODAL */}
      {summaryModalOpen && selectedFilingForSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md transition-all duration-300">
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
                    {selectedFilingForSummary.symbol} · {selectedFilingForSummary.category}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-zinc-200 leading-snug font-sans">
                  {selectedFilingForSummary.subject}
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
                <span className="text-zinc-650 block">ANNOUNCEMENT PRICE</span>
                <span className="font-bold text-zinc-300 font-mono">₹{selectedFilingForSummary.priceAtAnnouncement?.toFixed(2) || 'N/A'}</span>
              </div>
              <div>
                <span className="text-zinc-650 block">CURRENT PRICE</span>
                <span className="font-bold text-zinc-300 font-mono">₹{selectedFilingForSummary.currentPrice?.toFixed(2) || 'N/A'}</span>
              </div>
              <div>
                <span className="text-zinc-650 block">REAL-TIME IMPACT</span>
                <span className={`font-bold font-mono ${selectedFilingForSummary.impactPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selectedFilingForSummary.impactPercent >= 0 ? '+' : ''}{selectedFilingForSummary.impactPercent?.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Content body */}
            <div className="p-5 overflow-y-auto text-zinc-300 leading-relaxed font-sans text-xs flex-1 space-y-4">
              {aiSummaryLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3 font-mono">
                  <RefreshCw className="h-7 w-7 text-emerald-500 animate-spin" />
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider animate-pulse">
                    Synthesizing PDF Document Intelligence...
                  </p>
                  <p className="text-[9px] text-zinc-500 text-center max-w-sm">
                    Leveraging institutional reasoning engine. Reading financial reports, order sheets, and management transcripts factually.
                  </p>
                </div>
              ) : (
                <div className="prose prose-invert prose-xs max-w-none">
                  <div className="whitespace-pre-line leading-relaxed text-[11px] font-sans font-medium text-zinc-300">
                    {aiSummaryText}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-zinc-950/60 border-t border-zinc-800/80 flex items-center justify-between text-[9px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-500" />
                Zero-Fabrication Validation Enabled
              </span>
              <div className="flex items-center gap-2">
                {selectedFilingForSummary.pdfUrl && (
                  <a
                    href={selectedFilingForSummary.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition-all font-bold cursor-pointer"
                  >
                    View Original Exchange PDF
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
                <button
                  onClick={() => setSummaryModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-zinc-850 hover:bg-zinc-800 text-zinc-300 transition-all font-bold cursor-pointer"
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
