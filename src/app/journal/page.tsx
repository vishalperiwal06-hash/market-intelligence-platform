'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, TrendingUp, TrendingDown, Target, ShieldAlert, Sparkles, Plus, X, MessageSquare } from 'lucide-react';

interface TradeLog {
  id: string;
  symbol: string;
  type: string;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  target: number | null;
  pnl: number | null;
  notes: string | null;
  aiInsight: string | null;
  timestamp: string;
}

interface JournalMetrics {
  totalTrades: number;
  closedCount: number;
  winRate: number;
  totalPnl: number;
  avgWinner: number;
  avgLoser: number;
}

export default function JournalPage() {
  const [trades, setTrades] = useState<TradeLog[]>([]);
  const [metrics, setMetrics] = useState<JournalMetrics>({
    totalTrades: 0,
    closedCount: 0,
    winRate: 0,
    totalPnl: 0,
    avgWinner: 0,
    avgLoser: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTradeInsight, setSelectedTradeInsight] = useState<string | null>(null);

  // Form states
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState('BUY');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadJournalData = () => {
    setLoading(true);
    fetch('/api/journal')
      .then((res) => res.json())
      .then((res) => {
        if (res.ok) {
          setTrades(res.trades || []);
          if (res.metrics) {
            setMetrics(res.metrics);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load journal:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadJournalData();
  }, []);

  const handleOpenModal = () => {
    setFormError('');
    setSymbol('');
    setType('BUY');
    setEntryPrice('');
    setExitPrice('');
    setStopLoss('');
    setTarget('');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!symbol || !entryPrice) {
      setFormError('Symbol and Entry Price are required.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/journal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          type,
          entryPrice: parseFloat(entryPrice),
          exitPrice: exitPrice ? parseFloat(exitPrice) : null,
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          target: target ? parseFloat(target) : null,
          notes,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        setIsModalOpen(false);
        loadJournalData();
      } else {
        setFormError(data.error || 'Failed to log trade.');
      }
    } catch (err) {
      setFormError('Failed to log trade. Check backend connectivity.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (val: number) => {
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(absVal);
    return `${isNegative ? '-' : ''}${formatted}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Trade Journal</h1>
          <p className="text-sm text-zinc-400">AI-powered trade analysis and performance tracking</p>
        </div>
        <button
          onClick={handleOpenModal}
          className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-md text-sm transition-all font-semibold active:scale-98"
        >
          <Plus className="h-4 w-4" /> Log New Trade
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-md">
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Win Rate</CardTitle>
            <Target className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-100 font-mono">
              {metrics.closedCount > 0 ? `${metrics.winRate}%` : '--%'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">
              On {metrics.closedCount} closed trades
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-md">
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total P&L</CardTitle>
            <TrendingUp className={`h-4 w-4 ${metrics.totalPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-black font-mono truncate ${
                metrics.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {metrics.closedCount > 0 ? formatCurrency(metrics.totalPnl) : '₹--.--'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">
              Cumulative Closed P&L
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-md">
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Avg Winner</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black font-mono text-emerald-400">
              {metrics.avgWinner > 0 ? formatCurrency(metrics.avgWinner) : '₹--.--'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">
              Per winning closed trade
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-md">
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Avg Loser</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black font-mono text-rose-400">
              {metrics.avgLoser < 0 ? formatCurrency(metrics.avgLoser) : '₹--.--'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">
              Per losing closed trade
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trades Table */}
      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-md">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-zinc-100">Recent Trades</CardTitle>
          <span className="text-xs text-zinc-500 font-mono">
            {trades.length} trades recorded
          </span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 w-full bg-zinc-850 rounded animate-pulse"></div>
              ))}
            </div>
          ) : trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-zinc-500 py-16 space-y-4 bg-zinc-950/20 rounded-md border border-dashed border-zinc-800">
              <BookOpen className="h-10 w-10 opacity-20 text-zinc-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-300">No trades logged yet.</p>
                <p className="text-xs text-zinc-500 mt-1">Get started by clicking the "Log New Trade" button.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-zinc-800 overflow-x-auto">
              <table className="w-full text-sm text-left text-zinc-400 min-w-[800px]">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/80 border-b border-zinc-800">
                  <tr>
                    <th scope="col" className="px-4 py-3">Symbol</th>
                    <th scope="col" className="px-4 py-3">Type</th>
                    <th scope="col" className="px-4 py-3 text-right">Entry</th>
                    <th scope="col" className="px-4 py-3 text-right">Exit</th>
                    <th scope="col" className="px-4 py-3 text-right">Stop Loss</th>
                    <th scope="col" className="px-4 py-3 text-right">Target</th>
                    <th scope="col" className="px-4 py-3 text-right">P&L</th>
                    <th scope="col" className="px-4 py-3">Notes</th>
                    <th scope="col" className="px-4 py-3 text-center">AI Analysis</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => {
                    const isClosed = trade.exitPrice !== null;
                    const isWinner = trade.pnl !== null && trade.pnl > 0;
                    
                    return (
                      <tr
                        key={trade.id}
                        className="bg-zinc-900/10 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors"
                      >
                        <td className="px-4 py-4 font-semibold text-zinc-200 font-mono">
                          {trade.symbol}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              trade.type === 'BUY'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            {trade.type}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-medium text-zinc-300">
                          ₹{trade.entryPrice.toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-medium text-zinc-300">
                          {isClosed ? `₹${trade.exitPrice?.toFixed(2)}` : '--'}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-zinc-400">
                          {trade.stopLoss ? `₹${trade.stopLoss.toFixed(2)}` : '--'}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-zinc-400">
                          {trade.target ? `₹${trade.target.toFixed(2)}` : '--'}
                        </td>
                        <td
                          className={`px-4 py-4 text-right font-mono font-bold ${
                            !isClosed ? 'text-zinc-500' : isWinner ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {!isClosed ? 'OPEN' : `${isWinner ? '+' : ''}${trade.pnl?.toFixed(2)}`}
                        </td>
                        <td className="px-4 py-4 text-xs text-zinc-400 truncate max-w-[150px]">
                          {trade.notes || '--'}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {trade.aiInsight ? (
                            <button
                              onClick={() => setSelectedTradeInsight(trade.aiInsight)}
                              className="text-zinc-400 hover:text-amber-400 bg-zinc-950 hover:bg-zinc-800 p-1.5 rounded-full border border-zinc-850 transition-all inline-flex items-center gap-1 active:scale-95"
                              title="View AI Insight Review"
                            >
                              <Sparkles className="h-4 w-4" />
                            </button>
                          ) : (
                            '--'
                          )}
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

      {/* AI Insight Dialog Modal Overlay */}
      {selectedTradeInsight && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full shadow-2xl overflow-hidden relative animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-zinc-950 p-4 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" /> AI Trade Audit Review
              </h3>
              <button
                onClick={() => setSelectedTradeInsight(null)}
                className="text-zinc-500 hover:text-zinc-350 bg-zinc-850 hover:bg-zinc-800 p-1 rounded-md transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-zinc-950/50 border border-zinc-850 p-4 rounded-md text-xs text-zinc-300 leading-relaxed">
                {selectedTradeInsight}
              </div>
              <p className="text-[10px] text-zinc-500 leading-normal text-right">
                Insight computed based on structural R:R ratios and live volume characteristics.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Log Trade Dialog Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full shadow-2xl overflow-hidden relative animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="bg-zinc-950 p-4 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-sm font-bold text-zinc-100">Log Trade Details</h3>
              <button
                onClick={handleCloseModal}
                className="text-zinc-500 hover:text-zinc-350 bg-zinc-850 hover:bg-zinc-800 p-1 rounded-md transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase">Symbol *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. RELIANCE"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase">Action *</label>
                  <div className="grid grid-cols-2 bg-zinc-950 border border-zinc-800 rounded p-1">
                    <button
                      type="button"
                      onClick={() => setType('BUY')}
                      className={`text-xs py-1 rounded font-bold transition-all ${
                        type === 'BUY'
                          ? 'bg-emerald-500 text-white'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      BUY
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('SELL')}
                      className={`text-xs py-1 rounded font-bold transition-all ${
                        type === 'SELL'
                          ? 'bg-rose-500 text-white'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      SELL
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase">Entry Price *</label>
                  <input
                    type="number"
                    required
                    step="any"
                    placeholder="₹ 0.00"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase">Exit Price</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="₹ 0.00 (Optional)"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase">Stop Loss</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="₹ 0.00"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase">Target</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="₹ 0.00"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase">Trade Notes</label>
                <textarea
                  placeholder="Notes on execution, market state, reasoning..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-zinc-850 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 text-sm rounded transition-all font-semibold active:scale-98"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-all font-semibold active:scale-98 disabled:opacity-50"
                >
                  {submitting ? 'Logging...' : 'Save Trade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
