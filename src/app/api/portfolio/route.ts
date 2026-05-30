import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tradeJournal, companies, activeSignals, technicalIndicators } from '@/lib/db/schema';
import { nseDataService } from '@/server/nse/nselib-service';
import { desc, inArray, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Fetch all journal logs
    const journalRows = await db.select()
      .from(tradeJournal)
      .orderBy(desc(tradeJournal.timestamp));

    // Filter active open positions (where exitPrice is null or undefined)
    let openPositions = journalRows.filter(r => r.exitPrice === null || r.exitPrice === undefined);

    let holdings: Array<{
      symbol: string;
      entryPrice: number;
      type: string;
      quantity: number;
      companyName: string;
      sector: string;
    }> = [];

    // 2. If no open positions, return empty collections
    if (openPositions.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          totalValue: 0,
          holdingsCount: 0,
          concentrationRisk: false,
          sectorExposure: {},
          warnings: [],
          correlations: [],
          holdings: [],
        }
      });
    }

    // Fetch company master records for the active symbols to get their sectors and names
    const openSymbols = openPositions.map(p => p.symbol);
    const dbCompanies = await db.select()
      .from(companies)
      .where(inArray(companies.symbol, openSymbols));

    const companyMap = new Map(dbCompanies.map(c => [c.symbol, c]));

    holdings = openPositions.map(p => {
      const comp = companyMap.get(p.symbol);
      const entry = p.entryPrice;
      // Assume default position size of ₹100,000 for quantity calculation
      const qty = Math.max(1, Math.round(100000 / entry));

      return {
        symbol: p.symbol,
        entryPrice: entry,
        type: p.type,
        quantity: qty,
        companyName: comp?.name || p.symbol,
        sector: comp?.sector || 'Diversified',
      };
    });

    const symbolsToQuery = holdings.map(h => h.symbol);

    // 3. Fetch real-time quotes from the live NSE Data Service
    const liveQuotes = await nseDataService.quotes(symbolsToQuery);
    const quoteMap = new Map(liveQuotes.map(q => [q.symbol, q]));

    // 4. Calculate real-time portfolio statistics
    let totalExposure = 0;
    const sectorValues: Record<string, number> = {};
    const processedHoldings = holdings.map(h => {
      const quote = quoteMap.get(h.symbol);
      const currentPrice = quote ? quote.price : h.entryPrice;
      const changePercent = quote ? quote.changePercent : 0;
      
      const currentValue = h.quantity * currentPrice;
      totalExposure += currentValue;

      // Accumulate sector value
      sectorValues[h.sector] = (sectorValues[h.sector] || 0) + currentValue;

      const pnl = h.type === 'BUY' 
        ? (currentPrice - h.entryPrice) * h.quantity
        : (h.entryPrice - currentPrice) * h.quantity;

      const pnlPercent = (pnl / (h.entryPrice * h.quantity)) * 100;

      return {
        ...h,
        currentPrice,
        changePercent,
        currentValue,
        pnl,
        pnlPercent,
      };
    });

    const sectorExposure: Record<string, number> = {};
    Object.entries(sectorValues).forEach(([sector, value]) => {
      sectorExposure[sector] = Number(((value / (totalExposure || 1)) * 100).toFixed(1));
    });

    // Dynamic Beta Mapping relative to NIFTY 50
    const betaMap: Record<string, number> = {
      'RELIANCE': 1.05,
      'TCS': 0.78,
      'HDFCBANK': 1.15,
      'INFY': 0.92,
      'ICICIBANK': 1.22,
      'SBIN': 1.28,
      'SUZLON': 1.68,
      'BEL': 1.24,
      'IRCTC': 1.12,
      'PGEL': 1.45,
      'PREMIERENE': 1.55,
      'MTARTECH': 1.35
    };

    let totalWeightedBeta = 0;
    const holdingsWithBeta = processedHoldings.map(h => {
      const beta = betaMap[h.symbol] || 1.0;
      totalWeightedBeta += beta * h.currentValue;
      return {
        ...h,
        beta
      };
    });

    const portfolioBeta = Number((totalWeightedBeta / (totalExposure || 1)).toFixed(2));

    // Detect Concentration Risk and compile advanced Warnings
    const warnings: string[] = [];
    let concentrationRisk = false;
    
    Object.entries(sectorExposure).forEach(([sector, pct]) => {
      if (pct > 30) {
        concentrationRisk = true;
        warnings.push(`High concentration risk: Sector (${sector}) represents ${pct}% of total assets.`);
      }
    });

    if (portfolioBeta > 1.25) {
      warnings.push(`High beta warning: Portfolio volatility is ${Math.round((portfolioBeta - 1) * 100)}% higher than the NIFTY index.`);
    }

    if (holdings.length < 4) {
      warnings.push("Diversification advisory: Portfolio has fewer than 4 holdings, representing high single-stock risk.");
    }

    // 5. Build dynamic Evidence-Grounded Correlation Engine Outputs
    // Fetch active signals for these symbols
    const dbSignals = await db.select()
      .from(activeSignals)
      .where(inArray(activeSignals.symbol, symbolsToQuery))
      .orderBy(desc(activeSignals.timestamp));

    // Fetch latest daily indicators for these symbols
    const dbIndicators = await db.select()
      .from(technicalIndicators)
      .where(inArray(technicalIndicators.symbol, symbolsToQuery));

    const indicatorMap = new Map(dbIndicators.map(i => [i.symbol, i]));

    const correlations = holdingsWithBeta.map(h => {
      const signal = dbSignals.find(s => s.symbol === h.symbol);
      const ind = indicatorMap.get(h.symbol);
      
      let event = 'Price Stability Monitoring';
      let catalyst = 'Market Ingestion Active';
      let chain = `Continuous data stream confirmed. Trading standard volatility bands.`;

      if (signal) {
        event = signal.signalName;
        catalyst = `${signal.direction.toUpperCase()} ${signal.signalType.toUpperCase()}`;
        chain = `Scanner detected ${signal.signalName} with ${signal.confidence}% confidence. Real-time price is ₹${h.currentPrice.toLocaleString('en-IN')} (${h.changePercent >= 0 ? '+' : ''}${h.changePercent.toFixed(2)}%).`;
      } else if (ind) {
        const rsi = ind.rsi14 || 50;
        const macdHist = ind.macdHistogram || 0;
        const trend = h.currentPrice > (ind.ema50 || 0) ? 'Bullish trend alignment above 50 EMA' : 'Consolidation phase below 50 EMA';
        
        event = rsi > 60 ? 'Momentum Expansion' : rsi < 40 ? 'Oversold Accumulation' : 'Volatility Squeeze';
        catalyst = rsi > 60 ? 'RSI Momentum' : rsi < 40 ? 'Support Reversal' : 'Mean Reversion';
        chain = `Indicators show RSI at ${rsi.toFixed(1)} (${rsi > 60 ? 'Strong' : rsi < 40 ? 'Weak' : 'Neutral'}) and MACD Hist at ${macdHist.toFixed(2)}. ${trend}.`;
      } else {
        chain = `Holding ${h.symbol} is actively tracked. Real-time market feed is active at ₹${h.currentPrice.toLocaleString('en-IN')}.`;
      }

      // Add a risk flag description
      const riskFlag = h.beta > 1.25 ? 'High Volatility' : 'Normal Volatility';

      return {
        symbol: h.symbol,
        event,
        catalyst,
        chain,
        beta: h.beta,
        riskFlag
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        totalValue: Math.round(totalExposure),
        holdingsCount: holdings.length,
        concentrationRisk,
        sectorExposure,
        warnings,
        correlations,
        holdings: holdingsWithBeta,
        portfolioBeta
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: 'Failed to compute portfolio intelligence', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { holdings } = body; // Array of { symbol, entryPrice, quantity }

    if (!holdings || !Array.isArray(holdings)) {
      return NextResponse.json(
        { ok: false, error: 'Holdings array is required' },
        { status: 400 }
      );
    }

    // Insert each holding into tradeJournal
    for (const h of holdings) {
      if (!h.symbol || !h.entryPrice) continue;
      
      const symbolUpper = h.symbol.toUpperCase().trim();
      const existingComp = await db.select()
        .from(companies)
        .where(eq(companies.symbol, symbolUpper));

      if (existingComp.length === 0) {
        // Seed company record dynamically to prevent foreign key errors
        await db.insert(companies).values({
          symbol: symbolUpper,
          name: `${symbolUpper} Limited`,
          sector: 'Diversified',
          isActive: true
        });
      }

      await db.insert(tradeJournal).values({
        symbol: symbolUpper,
        type: 'BUY',
        entryPrice: parseFloat(h.entryPrice),
        exitPrice: null,
        notes: 'Imported via Portfolio Upload Manager',
        timestamp: new Date()
      });
    }

    return NextResponse.json({ ok: true, message: 'Holdings successfully imported' });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: 'Failed to import holdings', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Clear all holdings in tradeJournal
    await db.delete(tradeJournal);
    return NextResponse.json({ ok: true, message: 'Portfolio cleared successfully' });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: 'Failed to reset portfolio', details: error.message },
      { status: 500 }
    );
  }
}
