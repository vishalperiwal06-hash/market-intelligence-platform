'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowUpRight, ArrowDownRight, Activity, Compass, TrendingUp,
  HelpCircle, Bot, Zap, LayoutGrid, Layers, BarChart2,
} from 'lucide-react';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { formatPrice, formatPercent, safeFloat } from '@/lib/formatters';

// Market components
import { OptionChainWidget }      from '@/components/market/OptionChainWidget';
import { SectorStrength }         from '@/components/market/SectorStrength';
import { AINarrativeWidget }      from '@/components/market/AINarrativeWidget';
import { CorporateFilingsFeed }   from '@/components/market/CorporateFilingsFeed';
import { FiiDiiFlowTracker }      from '@/components/market/FiiDiiFlowTracker';
import { InstitutionalDealsFeed } from '@/components/market/InstitutionalDealsFeed';
import { MarketNewsFeed }         from '@/components/market/MarketNewsFeed';
import { SignalFeed }             from '@/components/market/SignalFeed';
import { MarketHeatmap }          from '@/components/market/MarketHeatmap';
import { VixGaugeWidget }         from '@/components/market/VixGaugeWidget';
import { StockChart }             from '@/components/market/StockChart';
import { TopMoversWidget }        from '@/components/market/TopMoversWidget';
import { CompanyLogo }           from '@/components/market/CompanyLogo';

/* ─────────────── helpers ─────────────── */
function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-1.5 rounded bg-zinc-950/60 border border-zinc-900 min-w-[70px]">
      <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-600 font-mono">{label}</span>
      <span className={`text-sm font-black font-mono tracking-tight mt-0.5 ${color}`}>{value}</span>
    </div>
  );
}

function IndexCard({ name, data, flash }: { name: string; data: any; flash?: 'up' | 'down' | null }) {
  const isUp  = data ? safeFloat(data.change) >= 0 : true;
  const color = isUp ? 'text-emerald-400' : 'text-rose-400';
  const bar   = isUp ? 'bg-emerald-500' : 'bg-rose-500';

  return (
    <Card className={`bg-terminal-card border-zinc-850 shadow-md overflow-hidden relative group transition-all duration-300 hover:border-zinc-700 ${
      flash === 'up'   ? 'animate-flash-up'   :
      flash === 'down' ? 'animate-flash-down' : ''
    }`}>
      <div className={`absolute top-0 left-0 w-full h-[2px] ${data ? bar : 'bg-zinc-800'}`} />
      <CardContent className="px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">{name}</span>
          <Activity className="h-3 w-3 text-zinc-700 group-hover:text-blue-500 transition-colors" />
        </div>
        {!data ? (
          <div className="space-y-1.5">
            <div className="shimmer h-6 w-28 rounded" />
            <div className="shimmer h-3 w-16 rounded" />
          </div>
        ) : (
          <>
            <div className="text-xl font-extrabold text-zinc-100 font-mono tracking-tight animate-count-up">
              {formatPrice(data.price)}
            </div>
            <div className={`flex items-center text-xs mt-0.5 font-mono font-bold ${color}`}>
              {isUp
                ? <ArrowUpRight   className="mr-0.5 h-3.5 w-3.5 shrink-0" />
                : <ArrowDownRight className="mr-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>{formatPercent(data.changePercent)}</span>
              <span className="ml-1 text-zinc-600 font-normal text-[9px]">
                ({isUp ? '+' : ''}{safeFloat(data.change).toFixed(2)})
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────── main dashboard ─────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { connected, initialize, marketData, indices, breadth } = useMarketStore();
  const [copilotQuery, setCopilotQuery] = useState('');
  const [chartSymbol, setChartSymbol]   = useState('RELIANCE');
  const [symbolInput, setSymbolInput]   = useState('RELIANCE');
  const [currentTime, setCurrentTime]   = useState('');

  // Live clock
  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toLocaleTimeString('en-IN', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Price flash tracking
  const prevPrices = useRef<Record<string, number>>({});
  const [priceFlash, setPriceFlash] = useState<Record<string, 'up' | 'down' | null>>({});

  useEffect(() => { initialize(); }, [initialize]);

  useEffect(() => {
    const flashes: Record<string, 'up' | 'down' | null> = {};
    let changed = false;
    Object.entries(marketData).forEach(([sym, d]) => {
      const prev = prevPrices.current[sym];
      if (prev !== undefined && prev !== d.price) {
        flashes[sym] = d.price > prev ? 'up' : 'down';
        changed = true;
      }
      prevPrices.current[sym] = d.price;
    });
    if (changed) {
      setPriceFlash(f => ({ ...f, ...flashes }));
      const t = setTimeout(() => setPriceFlash({}), 1200);
      return () => clearTimeout(t);
    }
  }, [marketData]);

  const { topGainers, topLosers } = useMemo(() => {
    const list = Object.values(marketData).filter(s => s?.symbol);
    if (!list.length) return { topGainers: [], topLosers: [] };
    const sorted = [...list].sort((a, b) => safeFloat(b.changePercent) - safeFloat(a.changePercent));
    return { topGainers: sorted.slice(0, 5), topLosers: sorted.slice(-5).reverse() };
  }, [marketData]);

  const indicesList = [
    { key: '^NSEI',    name: 'NIFTY 50'   },
    { key: '^NSEBANK', name: 'BANK NIFTY' },
    { key: '^BSESN',   name: 'SENSEX'     },
  ];

  const handleCopilot = (e: React.FormEvent) => {
    e.preventDefault();
    if (copilotQuery.trim()) router.push(`/copilot?query=${encodeURIComponent(copilotQuery.trim())}`);
  };

  const handleChartLoad = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbolInput.trim()) setChartSymbol(symbolInput.trim().toUpperCase());
  };

  /* breadth calc */
  const adv  = safeFloat(breadth?.advances);
  const dec  = safeFloat(breadth?.declines);
  const unch = safeFloat(breadth?.unchanged);
  const tot  = adv + dec + unch || 1;
  const adRatio = dec > 0 ? (adv / dec).toFixed(2) : adv.toFixed(2);

  return (
    <div className="space-y-5 max-w-[1820px] mx-auto pb-10 text-zinc-100 bg-terminal-dark">

      {/* ══════════ TICKER TAPE ══════════ */}
      <div className="w-full bg-zinc-950/90 border-b border-zinc-900 h-9 flex items-center relative overflow-hidden shadow-inner">
        <div className="absolute left-0 top-0 h-full bg-zinc-950 px-3 flex items-center z-20 border-r border-zinc-900 gap-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[9px] font-black text-blue-400 tracking-widest font-mono">LIVE</span>
        </div>
        <div
          className="flex h-full items-center gap-6 pl-[70px] pr-4 whitespace-nowrap"
          style={{ animation: 'marquee 60s linear infinite', willChange: 'transform' }}
          onMouseEnter={e => (e.currentTarget.style.animationPlayState = 'paused')}
          onMouseLeave={e => (e.currentTarget.style.animationPlayState = 'running')}
        >
          {Object.values(marketData).filter(s => s?.symbol).length === 0 ? (
            <span className="text-xs text-zinc-700 italic font-mono">Connecting to exchange data stream...</span>
          ) : (
            (() => {
              const list = Object.values(marketData).filter(s => s?.symbol).slice(0, 30);
              return [...list, ...list].map((stock, i) => {
                const isUp  = safeFloat(stock.changePercent) >= 0;
                const flash = priceFlash[stock.symbol];
                return (
                  <Link
                    href={`/stocks/${(stock.symbol || '').toLowerCase()}`}
                    key={`${stock.symbol}-${i}`}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all duration-300 ${
                      flash === 'up'   ? 'bg-emerald-950/40 border-emerald-500/30' :
                      flash === 'down' ? 'bg-rose-950/40 border-rose-500/30'       :
                      'border-transparent hover:bg-zinc-900 hover:border-zinc-800'
                    }`}
                  >
                    <CompanyLogo symbol={stock.symbol} size="sm" />
                    <span className="text-[10px] font-bold text-zinc-400 font-mono">{stock.symbol}</span>
                    <span className="text-[10px] font-black text-zinc-200 font-mono">{formatPrice(stock.price)}</span>
                    <span className={`text-[9px] font-bold font-mono ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(stock.changePercent)}
                    </span>
                  </Link>
                );
              });
            })()
          )}
        </div>
      </div>

      {/* ══════════ HEADER ══════════ */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-lg font-black tracking-tight text-zinc-100 uppercase font-mono flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-blue-500 rounded-sm animate-pulse inline-block" />
            Indian Markets Terminal
          </h1>
          <p className="text-[9px] text-zinc-600 font-semibold tracking-widest uppercase font-mono">
            AI-Powered Institutional Intelligence · NSE / BSE · Real-Time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-600 tabular-nums">{currentTime} IST</span>
          {connected ? (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1.5 py-1 text-[9px] font-mono animate-breathe">
              <span className="live-dot" />
              EXCHANGE STREAM ACTIVE
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 gap-1.5 py-1 text-[9px] font-mono animate-pulse">
              ⟳ SYNCING PIPELINE...
            </Badge>
          )}
        </div>
      </div>

      {/* ══════════ INDICES ROW ══════════ */}
      <div className="grid gap-3 grid-cols-3">
        {indicesList.map(idx => (
          <ErrorBoundary key={idx.name} name={idx.name}>
            <IndexCard
              name={idx.name}
              data={indices[idx.key]}
              flash={priceFlash[idx.key]}
            />
          </ErrorBoundary>
        ))}
      </div>

      {/* ══════════ BREADTH STATS BAR ══════════ */}
      {breadth && (
        <div className="flex items-center gap-3 px-1 flex-wrap">
          <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest font-mono">Market Pulse:</span>
          <StatPill label="Advances"  value={String(breadth.advances ?? 0)}  color="text-emerald-400" />
          <StatPill label="Declines"  value={String(breadth.declines ?? 0)}  color="text-rose-400"    />
          <StatPill label="Unchanged" value={String(breadth.unchanged ?? 0)} color="text-zinc-400"    />
          <StatPill label="A/D Ratio" value={adRatio}                        color="text-blue-400"    />
          {/* Breadth bar */}
          <div className="flex-1 min-w-[120px] h-2 flex rounded overflow-hidden bg-zinc-900 border border-zinc-800">
            <div style={{ width: `${(adv / tot) * 100}%` }} className="bg-emerald-500/80 transition-all duration-700" />
            <div style={{ width: `${(unch / tot) * 100}%` }} className="bg-zinc-600/60 transition-all duration-700" />
            <div style={{ width: `${(dec / tot) * 100}%` }} className="bg-rose-500/80 transition-all duration-700" />
          </div>
        </div>
      )}

      {/* ══════════ ROW 1: 5-COLUMN MAIN GRID ══════════ */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-12">

        {/* LEFT – Sector Strength + VIX */}
        <div className="md:col-span-3 space-y-4">
          <ErrorBoundary name="Sector Strength">
            <SectorStrength />
          </ErrorBoundary>
          <ErrorBoundary name="VIX Gauge">
            <VixGaugeWidget />
          </ErrorBoundary>
        </div>

        {/* CENTER-LEFT – Top Movers + Option Chain */}
        <div className="md:col-span-3 space-y-4">
          <ErrorBoundary name="Top Movers">
            <TopMoversWidget />
          </ErrorBoundary>
          <ErrorBoundary name="Option Chain">
            <OptionChainWidget symbol="NIFTY" />
          </ErrorBoundary>
        </div>

        {/* CENTER-RIGHT – Interactive Chart */}
        <div className="md:col-span-4 space-y-4">
          {/* Symbol search bar */}
          <form onSubmit={handleChartLoad} className="flex gap-2">
            <input
              value={symbolInput}
              onChange={e => setSymbolInput(e.target.value.toUpperCase())}
              placeholder="Symbol e.g. RELIANCE"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono uppercase"
            />
            <button
              type="submit"
              className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs font-bold px-3 py-1.5 rounded border border-blue-500/30 transition-all font-mono"
            >
              CHART
            </button>
          </form>
          <ErrorBoundary name="Stock Chart">
            <StockChart symbol={chartSymbol} height={360} />
          </ErrorBoundary>
        </div>

        {/* RIGHT – AI Narrative + Copilot + News */}
        <div className="md:col-span-2 space-y-4">
          <ErrorBoundary name="AI Narrative">
            <AINarrativeWidget />
          </ErrorBoundary>

          {/* Copilot Quick Query */}
          <Card className="bg-terminal-card border-zinc-850">
            <CardHeader className="pb-2 border-b border-zinc-850">
              <CardTitle className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                AI Copilot
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <form onSubmit={handleCopilot} className="space-y-2.5">
                <p className="text-[9px] text-zinc-600 font-semibold uppercase tracking-wider font-mono">
                  Ask about any stock, con-call, or market event:
                </p>
                <textarea
                  value={copilotQuery}
                  onChange={e => setCopilotQuery(e.target.value)}
                  placeholder="e.g. Why is BEL moving today?"
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-[10px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans resize-none"
                />
                <button
                  type="submit"
                  disabled={!copilotQuery.trim()}
                  className="w-full bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 text-[10px] font-bold py-1.5 px-3 rounded border border-emerald-500/25 hover:border-emerald-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-mono uppercase tracking-wider"
                >
                  Analyze →
                </button>
              </form>
            </CardContent>
          </Card>

          <ErrorBoundary name="Market News">
            <MarketNewsFeed limit={5} showViewMore={true} />
          </ErrorBoundary>
        </div>
      </div>

      {/* ══════════ ROW 2: HEATMAP (full width) ══════════ */}
      <ErrorBoundary name="Market Heatmap">
        <MarketHeatmap />
      </ErrorBoundary>

      {/* ══════════ ROW 3: SIGNAL FEED + OPTION CHAIN DETAIL ══════════ */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <ErrorBoundary name="Signal Feed">
          <SignalFeed limit={5} showViewMore={true} />
        </ErrorBoundary>
        <ErrorBoundary name="Option Chain BANKNIFTY">
          <OptionChainWidget symbol="BANKNIFTY" />
        </ErrorBoundary>
      </div>

      {/* ══════════ ROW 4: INSTITUTIONAL HUB ══════════ */}
      <div className="border-t border-zinc-900 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-emerald-400" />
          <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-mono">
            Institutional Flow &amp; Corporate Intelligence Hub
          </h2>
        </div>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          <ErrorBoundary name="FII DII Flows">
            <FiiDiiFlowTracker />
          </ErrorBoundary>
          <ErrorBoundary name="Institutional Deals">
            <InstitutionalDealsFeed limit={5} showViewMore={true} />
          </ErrorBoundary>
          <ErrorBoundary name="Corporate Filings">
            <CorporateFilingsFeed limit={5} showViewMore={true} />
          </ErrorBoundary>
        </div>
      </div>

      {/* ══════════ ROW 5: QUICK CHART TRIO — NIFTY, BANKNIFTY, SENSEX ══════════ */}
      <div className="border-t border-zinc-900 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="h-4 w-4 text-blue-400" />
          <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-mono">
            Index Performance Charts
          </h2>
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {['NIFTY', 'BANKNIFTY', 'SENSEX'].map(sym => (
            <ErrorBoundary key={sym} name={`${sym} Chart`}>
              <StockChart symbol={sym} height={220} showVolume={false} />
            </ErrorBoundary>
          ))}
        </div>
      </div>

    </div>
  );
}
