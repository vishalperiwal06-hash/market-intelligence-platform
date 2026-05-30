'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, ArrowUpRight, ArrowDownRight, ShieldAlert, ShieldCheck, FileText, Star, 
  Download, Clock, TrendingUp, TrendingDown, BookOpen, Compass, Info, PieChart
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { StockChart } from '@/components/market/StockChart';
import { IndicatorPanel } from '@/components/market/IndicatorPanel';

interface FinancialRecord {
  id: string;
  period: string;
  revenue: number;
  pat: number;
  ebitda: number;
  operatingMargin: number;
  yoyGrowth: number;
  qoqGrowth: number;
  guidance: string;
  sourceTextSnippet: string;
}

interface FilingRecord {
  id: string;
  exchange: string;
  category: string;
  subject: string;
  details: string;
  broadcastDate: string;
  pdfUrl: string | null;
}

interface NewsRecord {
  id: string;
  source: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

interface CommentaryRecord {
  id: string;
  topic: string;
  commentary: string;
  sentimentScore: number;
  sourceTextSnippet: string;
}

export default function CompanyPage() {
  const params = useParams();
  const symbol = (params?.symbol as string || 'UNKNOWN').toUpperCase();
  const { initialize, marketData, connected } = useMarketStore();

  // Dynamic content states
  const [financials, setFinancials] = useState<FinancialRecord[]>([]);
  const [filings, setFilings] = useState<FilingRecord[]>([]);
  const [news, setNews] = useState<NewsRecord[]>([]);
  const [commentary, setCommentary] = useState<CommentaryRecord[]>([]);
  const [loadingStates, setLoadingStates] = useState({
    financials: true,
    filings: true,
    news: true,
    commentary: true
  });

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Fetch all corporate data
  useEffect(() => {
    const fetchData = async () => {
      setLoadingStates({ financials: true, filings: true, news: true, commentary: true });

      // 1. Fetch Financials
      try {
        const res = await fetch(`/api/corporate/financials?symbol=${symbol}`);
        if (res.ok) {
          const json = await res.json();
          setFinancials(json.financials || []);
        }
      } catch (err) {
        console.error('Failed to load financials', err);
      } finally {
        setLoadingStates(prev => ({ ...prev, financials: false }));
      }

      // 2. Fetch Filings
      try {
        const res = await fetch(`/api/corporate/filings?symbol=${symbol}&limit=10`);
        if (res.ok) {
          const json = await res.json();
          setFilings(json.filings || []);
        }
      } catch (err) {
        console.error('Failed to load filings', err);
      } finally {
        setLoadingStates(prev => ({ ...prev, filings: false }));
      }

      // 3. Fetch News
      try {
        const res = await fetch(`/api/corporate/news?symbol=${symbol}`);
        if (res.ok) {
          const json = await res.json();
          setNews(json.news || []);
        }
      } catch (err) {
        console.error('Failed to load news', err);
      } finally {
        setLoadingStates(prev => ({ ...prev, news: false }));
      }

      // 4. Fetch Commentary
      try {
        const res = await fetch(`/api/corporate/commentary?symbol=${symbol}`);
        if (res.ok) {
          const json = await res.json();
          setCommentary(json.commentary || []);
        }
      } catch (err) {
        console.error('Failed to load commentary', err);
      } finally {
        setLoadingStates(prev => ({ ...prev, commentary: false }));
      }
    };

    if (symbol !== 'UNKNOWN') {
      fetchData();
    }
  }, [symbol]);

  const liveData = useMemo(() => marketData[symbol] || null, [marketData, symbol]);
  const isUp = liveData ? liveData.change >= 0 : true;

  // Calculate dynamic average sentiment
  const avgSentiment = useMemo(() => {
    if (commentary.length === 0) return 0.5;
    const total = commentary.reduce((sum, item) => sum + item.sentimentScore, 0);
    const score = total / commentary.length; // Range: -1 to 1
    // Normalize to 0 to 1
    return (score + 1) / 2;
  }, [commentary]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      
      {/* ────────────────────────────────────────────── */}
      {/* HEADER SECTION */}
      {/* ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100">{symbol}</h1>
            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold px-2 py-0.5">NSE/BSE</Badge>
            {connected && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1 uppercase font-mono tracking-wider">
            Real-time Exchange Sourced intelligence Layer
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all border border-zinc-800">
            <Star className="h-4 w-4" /> Watchlist
          </button>
          
          <div className="text-right">
            {liveData ? (
              <>
                <div className="text-3xl font-bold text-zinc-100 font-mono">₹{liveData.price.toLocaleString('en-IN')}</div>
                <div className={`flex items-center text-xs mt-1 justify-end font-bold font-mono ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUp ? <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> : <ArrowDownRight className="mr-1 h-3.5 w-3.5" />}
                  {isUp ? '+' : ''}{liveData.change.toFixed(2)} ({isUp ? '+' : ''}{liveData.changePercent.toFixed(2)}%)
                </div>
              </>
            ) : (
              <>
                <div className="h-9 w-28 bg-zinc-900 rounded animate-pulse" />
                <div className="h-4 w-20 bg-zinc-900/50 rounded animate-pulse mt-2 ml-auto" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────── */}
      {/* OHLC STATS BAR */}
      {/* ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Open', value: liveData?.open },
          { label: 'High', value: liveData?.high },
          { label: 'Low', value: liveData?.low },
          { label: 'Close', value: liveData?.close },
          { label: 'Volume', value: liveData?.volume, isFmt: true },
          { label: 'Turnover', value: liveData?.turnover, isCurrency: true },
        ].map(stat => (
          <div key={stat.label} className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-3.5 shadow-md">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{stat.label}</div>
            {stat.value != null ? (
              <div className="text-sm font-mono font-bold text-zinc-200 mt-1">
                {stat.isCurrency
                  ? `₹${(stat.value / 1e7).toFixed(2)}Cr`
                  : stat.isFmt
                    ? `${(stat.value / 1e5).toFixed(2)}L`
                    : `₹${stat.value.toLocaleString('en-IN')}`
                }
              </div>
            ) : (
              <div className="h-5 w-16 bg-zinc-900/80 rounded animate-pulse mt-1" />
            )}
          </div>
        ))}
      </div>

      {/* ────────────────────────────────────────────── */}
      {/* MAIN GRID */}
      {/* ────────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-12">
        
        {/* Left/Main Column */}
        <div className="md:col-span-8 flex flex-col gap-6">
          
          {/* Live Interactive Chart */}
          <StockChart symbol={symbol} />

          {/* Interactive Tabs */}
          <Tabs defaultValue="financials" className="w-full">
            <TabsList className="bg-zinc-950 border border-zinc-800 p-1 w-full justify-start rounded-lg flex-wrap">
              <TabsTrigger value="financials" className="data-[state=active]:bg-zinc-900 data-[state=active]:text-zinc-100 text-zinc-400 text-xs font-semibold px-4">Financials</TabsTrigger>
              <TabsTrigger value="commentary" className="data-[state=active]:bg-zinc-900 data-[state=active]:text-zinc-100 text-zinc-400 text-xs font-semibold px-4">AI Concall Commentary</TabsTrigger>
              <TabsTrigger value="filings" className="data-[state=active]:bg-zinc-900 data-[state=active]:text-zinc-100 text-zinc-400 text-xs font-semibold px-4">Live Filings</TabsTrigger>
              <TabsTrigger value="news" className="data-[state=active]:bg-zinc-900 data-[state=active]:text-zinc-100 text-zinc-400 text-xs font-semibold px-4">Financial News</TabsTrigger>
            </TabsList>

            {/* Financial Statements */}
            <TabsContent value="financials" className="mt-4">
              <Card className="bg-zinc-900/60 border-zinc-800 shadow-2xl">
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400">Quarterly Earnings & Balance Sheets</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  {loadingStates.financials ? (
                    <div className="p-6 space-y-3 animate-pulse">
                      <div className="h-4 bg-zinc-950 rounded w-1/3" />
                      <div className="h-12 bg-zinc-950 rounded" />
                    </div>
                  ) : financials.length === 0 ? (
                    <div className="p-6 flex flex-col items-center text-center text-zinc-500 py-12">
                      <FileText className="h-8 w-8 mb-2 opacity-20" />
                      <p className="text-sm">No historical financial records stored for {symbol}</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800/60 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-5">Period</th>
                          <th className="py-3 px-4 text-right">Revenue (Cr)</th>
                          <th className="py-3 px-4 text-right">PAT (Cr)</th>
                          <th className="py-3 px-4 text-right">EBITDA (Cr)</th>
                          <th className="py-3 px-4 text-right">YoY Growth</th>
                          <th className="py-3 px-4 text-right">OPM %</th>
                          <th className="py-3 px-5">Management Outlook</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850/40">
                        {financials.map((f, idx) => (
                          <tr key={idx} className="hover:bg-zinc-950/20 transition-colors">
                            <td className="py-3.5 px-5 font-bold font-mono text-zinc-200">{f.period}</td>
                            <td className="py-3.5 px-4 text-right font-mono text-zinc-300">₹{f.revenue.toLocaleString('en-IN')}</td>
                            <td className="py-3.5 px-4 text-right font-mono text-zinc-300">₹{f.pat.toLocaleString('en-IN')}</td>
                            <td className="py-3.5 px-4 text-right font-mono text-zinc-300">₹{f.ebitda.toLocaleString('en-IN')}</td>
                            <td className={`py-3.5 px-4 text-right font-mono font-bold ${f.yoyGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {f.yoyGrowth >= 0 ? '+' : ''}{f.yoyGrowth.toFixed(1)}%
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-zinc-300">{f.operatingMargin.toFixed(1)}%</td>
                            <td className="py-3.5 px-5 text-zinc-400 max-w-xs truncate" title={f.guidance}>{f.guidance}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Management Commentary */}
            <TabsContent value="commentary" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {loadingStates.commentary ? (
                  <div className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-xl animate-pulse col-span-2 h-[200px] flex items-center justify-center">
                    <span className="text-xs text-zinc-500">Extracting con call transcripts...</span>
                  </div>
                ) : commentary.length === 0 ? (
                  <Card className="col-span-2 bg-zinc-900/60 border border-zinc-800 p-6 flex flex-col items-center justify-center text-center text-zinc-500 py-12">
                    <BookOpen className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm">Concall transcripts not yet processed for {symbol}</p>
                  </Card>
                ) : (
                  commentary.map((c, idx) => {
                    const isPositive = c.sentimentScore >= 0;
                    return (
                      <Card key={idx} className="bg-zinc-900/60 border border-zinc-800 shadow-xl relative overflow-hidden">
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPositive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                          <Badge className="bg-zinc-950 text-zinc-300 font-bold uppercase tracking-wider text-[9px] border-zinc-800">{c.topic}</Badge>
                          <div className="flex items-center gap-1 text-[10px] font-mono">
                            {isPositive ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-amber-400" />}
                            <span className={isPositive ? 'text-emerald-400' : 'text-amber-400'}>
                              {(c.sentimentScore * 100).toFixed(0)}%
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-2">
                          <p className="text-xs text-zinc-300 leading-relaxed font-sans">{c.commentary}</p>
                          <div className="pt-2 border-t border-zinc-850/60 text-[10px] text-zinc-500 italic leading-relaxed">
                            <span className="text-blue-400 font-bold not-italic mr-1">Exact Snippet:</span>
                            "{c.sourceTextSnippet}"
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>

            {/* Live Filings Tab */}
            <TabsContent value="filings" className="mt-4">
              <Card className="bg-zinc-900/60 border-zinc-800 shadow-2xl">
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400">NSE/BSE Corporate Filings</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingStates.filings ? (
                    <div className="p-6 space-y-3 animate-pulse">
                      <div className="h-8 bg-zinc-950 rounded" />
                    </div>
                  ) : filings.length === 0 ? (
                    <div className="p-6 flex flex-col items-center justify-center text-center text-zinc-500 py-12">
                      <FileText className="h-8 w-8 mb-2 opacity-20" />
                      <p className="text-sm">No live filings loaded for {symbol}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800/40">
                      {filings.map((filing, idx) => (
                        <div 
                          key={`${filing.id}-${idx}`}
                          onClick={() => filing.pdfUrl && window.open(filing.pdfUrl, '_blank')}
                          className={`p-4 hover:bg-zinc-950/20 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 group ${filing.pdfUrl ? 'cursor-pointer' : ''}`}
                        >
                          <div className="space-y-1.5 max-w-2xl">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-zinc-950 text-blue-400 font-bold border border-zinc-800 text-[9px] uppercase tracking-wider">{filing.category}</Badge>
                              <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(filing.broadcastDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-zinc-200 group-hover:text-blue-400 transition-colors leading-relaxed">{filing.subject}</h4>
                            <p className="text-[11px] text-zinc-500 font-sans leading-relaxed">{filing.details}</p>
                          </div>
                          {filing.pdfUrl && (
                            <span 
                              className="self-start sm:self-center shrink-0 flex items-center gap-1.5 text-[10px] text-blue-400 font-semibold bg-blue-500/10 px-3 py-1 rounded-lg transition-all border border-blue-900/20"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Filing PDF
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* News Articles */}
            <TabsContent value="news" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {loadingStates.news ? (
                  <div className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-xl animate-pulse col-span-2 h-[150px]" />
                ) : news.length === 0 ? (
                  <Card className="col-span-2 bg-zinc-900/60 border border-zinc-800 p-6 flex flex-col items-center justify-center text-center text-zinc-500 py-12">
                    <Activity className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm">No recent news articles found for {symbol}</p>
                  </Card>
                ) : (
                  news.map((item, idx) => (
                    <Card 
                      key={`${item.id}-${idx}`}
                      onClick={() => window.open(item.link, '_blank')}
                      className="bg-zinc-900/60 hover:bg-zinc-900/90 border border-zinc-800 shadow-xl cursor-pointer transition-all hover:scale-[1.01]"
                    >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                          <span>{item.source}</span>
                          <span>{new Date(item.pubDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        </div>
                        <CardTitle className="text-xs font-bold text-zinc-200 mt-1 leading-relaxed hover:text-blue-400 transition-colors">{item.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{item.description}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar Panel */}
        <div className="md:col-span-4 flex flex-col gap-6">
          
          {/* Real-time precalculated indicator board */}
          <IndicatorPanel
            symbol={symbol}
            timeframe="1d"
            currentPrice={liveData?.price}
          />

          {/* AI Advisor Card */}
          <Card className="bg-zinc-900/60 border-zinc-800 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 font-extrabold uppercase">AI Portfolio Advisor</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-850/50">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Sentiment Score</div>
                    <div className="font-mono text-sm font-bold text-zinc-200 mt-1 flex items-center gap-1.5">
                      {avgSentiment >= 0.5 ? <TrendingUp className="h-4.5 w-4.5 text-emerald-400" /> : <TrendingDown className="h-4.5 w-4.5 text-amber-400" />}
                      {(avgSentiment * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-850/50">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Factual Conviction</div>
                    <div className="font-mono text-sm font-bold text-blue-400 mt-1 flex items-center gap-1.5">
                      <ShieldCheck className="h-4.5 w-4.5 text-blue-400" />
                      100% Secure
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2 pt-3 border-t border-zinc-800/40 text-xs text-zinc-400 leading-relaxed font-sans">
                  {commentary.length > 0 ? (
                    <div>
                      <span className="text-blue-400 font-semibold uppercase tracking-wide text-[10px] block mb-1">Corporate Summary:</span>
                      Concall summaries reflect high focus on capital disciplines. {commentary[0]?.commentary}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-zinc-500 italic">
                      <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-amber-500" /> 
                      Awaiting daily indicator compilation to formulate deep-reasoning research profiles...
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
