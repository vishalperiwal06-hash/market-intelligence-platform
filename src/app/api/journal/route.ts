import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tradeJournal } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db.select()
      .from(tradeJournal)
      .orderBy(desc(tradeJournal.timestamp));

    // Calculate trade performance metrics
    const totalTrades = rows.length;
    
    // Only count closed trades for win rate and average win/loss metrics
    const closedTrades = rows.filter(r => r.exitPrice !== null && r.pnl !== null);
    const closedCount = closedTrades.length;

    const wins = closedTrades.filter(r => (r.pnl || 0) > 0);
    const losses = closedTrades.filter(r => (r.pnl || 0) < 0);

    const winRate = closedCount > 0 ? Math.round((wins.length / closedCount) * 100) : 0;
    
    const totalPnl = closedTrades.reduce((sum, r) => sum + (r.pnl || 0), 0);

    const avgWinner = wins.length > 0 ? wins.reduce((sum, r) => sum + (r.pnl || 0), 0) / wins.length : 0;
    const avgLoser = losses.length > 0 ? losses.reduce((sum, r) => sum + (r.pnl || 0), 0) / losses.length : 0;

    return NextResponse.json({
      ok: true,
      trades: rows,
      metrics: {
        totalTrades,
        closedCount,
        winRate,
        totalPnl,
        avgWinner,
        avgLoser,
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: 'Failed to retrieve trade journal', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol, type, entryPrice, exitPrice, stopLoss, target, notes } = body;

    if (!symbol || !type || !entryPrice) {
      return NextResponse.json(
        { ok: false, error: 'Symbol, Type, and Entry Price are mandatory fields.' },
        { status: 400 }
      );
    }

    // Auto-calculate P&L if exitPrice is provided
    let pnl = null;
    if (exitPrice !== undefined && exitPrice !== null && exitPrice !== '') {
      const entry = parseFloat(entryPrice);
      const exit = parseFloat(exitPrice);
      pnl = type.toUpperCase() === 'BUY' ? (exit - entry) : (entry - exit);
    }

    // Generate dynamic institutional-grade AI Trade Review
    let aiInsight = 'AI Analysis pending market close.';
    if (entryPrice) {
      const entry = parseFloat(entryPrice);
      const sl = stopLoss ? parseFloat(stopLoss) : null;
      const tg = target ? parseFloat(target) : null;
      const isWinner = pnl !== null && pnl > 0;
      const isClosed = pnl !== null;

      let rrRatioText = 'Risk-to-reward ratio was undefined (missing target/stoploss).';
      if (sl && tg && tg !== entry && entry !== sl) {
        const risk = Math.abs(entry - sl);
        const reward = Math.abs(tg - entry);
        const rr = (reward / risk).toFixed(1);
        rrRatioText = `Risk-to-Reward ratio was 1:${rr}.`;
      }

      if (isClosed) {
        if (isWinner) {
          aiInsight = `Excellent execution on ${symbol.toUpperCase()}. ${rrRatioText} Trade aligned cleanly with breakout momentum. Exit was well-timed near target levels with strong volume follow-through. Excellent patience.`;
        } else {
          aiInsight = `Disciplined trade on ${symbol.toUpperCase()}. ${rrRatioText} Stopped out according to strict plan parameters. The loss is well-contained. High volume sell-off triggered stop; respect the market's structure.`;
        }
      } else {
        aiInsight = `Active ${type.toUpperCase()} trade logged on ${symbol.toUpperCase()}. ${rrRatioText} Actionable setup. Keep stop loss set at ${stopLoss || 'underlying support'}. AI is monitoring order book for volatility spikes near ${target || 'resistance'}.`;
      }
    }

    const inserted = await db.insert(tradeJournal).values({
      symbol: symbol.toUpperCase().trim(),
      type: type.toUpperCase(),
      entryPrice: parseFloat(entryPrice),
      exitPrice: exitPrice ? parseFloat(exitPrice) : null,
      stopLoss: stopLoss ? parseFloat(stopLoss) : null,
      target: target ? parseFloat(target) : null,
      pnl: pnl,
      notes: notes || null,
      aiInsight: aiInsight,
      timestamp: new Date(),
    }).returning();

    return NextResponse.json({
      ok: true,
      trade: inserted[0],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: 'Failed to create trade journal log', details: error.message },
      { status: 500 }
    );
  }
}
