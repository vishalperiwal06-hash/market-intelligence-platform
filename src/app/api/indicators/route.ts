/**
 * Technical Indicators API
 *
 * GET /api/indicators?symbol=RELIANCE&timeframe=1d
 *
 * Returns precomputed indicators from cache/database.
 * Never computes indicators on the fly — they are always precomputed by the background worker.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { technicalIndicators, ohlcCandles } from '@/lib/db/schema';
import { redis } from '@/lib/redis';
import { eq, and, desc, sql } from 'drizzle-orm';
import { nseDataService } from '@/server/nse/nselib-service';
import { indicatorWorker } from '@/server/market-engine/workers/indicator-worker';
import { safeFloat } from '@/lib/formatters';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const timeframe = searchParams.get('timeframe') || '1d';

  if (!symbol) {
    return NextResponse.json({ error: 'symbol parameter is required' }, { status: 400 });
  }

  try {
    const cacheKey = `indicator:${timeframe}:${symbol}`;

    // Seeding Check: dynamically seed daily candles if count is low
    if (timeframe === '1d') {
      try {
        const countRes = await db
          .select({ count: sql<number>`count(*)` })
          .from(ohlcCandles)
          .where(and(
            eq(ohlcCandles.symbol, symbol),
            eq(ohlcCandles.timeframe, '1d')
          ));
        
        const candleCount = Number(countRes[0]?.count || 0);
        if (candleCount < 50) {
          const history = await nseDataService.historical(symbol, '1Y');
          if (history && history.length > 0) {
            const candlesToInsert = history.map((row: any) => {
              const dateStr = String(row.date || row.Date || row.CH_TIMESTAMP || '');
              const bucketStart = new Date(dateStr);
              if (isNaN(bucketStart.getTime())) return null;

              const o = safeFloat(row.open_price || row.OpenPrice || row['Open Price'] || row.open || row.CH_OPENING_PRICE || 0);
              const h = safeFloat(row.high_price || row.HighPrice || row['High Price'] || row.high || row.CH_TRADE_HIGH_PRICE || o);
              const l = safeFloat(row.low_price  || row.LowPrice  || row['Low Price']  || row.low  || row.CH_TRADE_LOW_PRICE  || o);
              const c = safeFloat(row.close_price || row.ClosePrice || row['Close Price'] || row.close || row.CH_CLOSING_PRICE || o);
              const v = safeFloat(row.total_traded_quantity || row.TotalTradedQuantity || row['Total Traded Quantity'] || row.volume || row.CH_TOT_TRADED_QTY || 0);

              return {
                symbol,
                timeframe: '1d',
                open: o,
                high: h,
                low: l,
                close: c,
                volume: v,
                turnover: safeFloat(row.turnover_lacs || row.TurnoverInRs || 0),
                tickCount: 1,
                bucketStart,
                bucketEnd: new Date(bucketStart.getTime() + 86400000),
              };
            }).filter((c): c is NonNullable<typeof c> => c !== null && (c.open > 0 || c.close > 0));

            if (candlesToInsert.length > 0) {
              for (const candle of candlesToInsert) {
                await db.insert(ohlcCandles).values(candle).onConflictDoUpdate({
                  target: [ohlcCandles.symbol, ohlcCandles.timeframe, ohlcCandles.bucketStart],
                  set: {
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume,
                    turnover: candle.turnover,
                  }
                });
              }

              // Compute technical indicators after seeding
              const snapshot = await indicatorWorker.computeForSymbol(symbol, '1d');
              if (snapshot) {
                const now = new Date();
                await db.insert(technicalIndicators).values({
                  symbol,
                  timeframe: '1d',
                  timestamp: now,
                  ...snapshot,
                }).onConflictDoUpdate({
                  target: [technicalIndicators.symbol, technicalIndicators.timeframe, technicalIndicators.timestamp],
                  set: snapshot,
                });

                await redis.set(cacheKey, JSON.stringify(snapshot), 'EX', 120);

                return NextResponse.json({
                  symbol,
                  timeframe,
                  source: 'seeded',
                  indicators: snapshot,
                });
              }
            }
          }
        }
      } catch (err: any) {
        console.error(`Indicator dynamic seeding failed for ${symbol}:`, err);
      }
    }

    // Redis first — near-instant reads
    const cached = await redis.get(cacheKey);

    if (cached) {
      return NextResponse.json({
        symbol,
        timeframe,
        source: 'cache',
        indicators: JSON.parse(cached),
      });
    }

    // Fall back to Postgres — get latest computed snapshot
    const rows = await db
      .select()
      .from(technicalIndicators)
      .where(and(
        eq(technicalIndicators.symbol, symbol),
        eq(technicalIndicators.timeframe, timeframe),
      ))
      .orderBy(desc(technicalIndicators.timestamp))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({
        symbol,
        timeframe,
        source: 'none',
        indicators: null,
        message: 'No indicator data available yet. Indicators are computed from genuine market data only.',
      });
    }

    const row = rows[0];
    const indicators = {
      ema20: row.ema20,
      ema50: row.ema50,
      ema200: row.ema200,
      rsi14: row.rsi14,
      macdLine: row.macdLine,
      macdSignal: row.macdSignal,
      macdHistogram: row.macdHistogram,
      bbUpper: row.bbUpper,
      bbMiddle: row.bbMiddle,
      bbLower: row.bbLower,
      vwap: row.vwap,
      atr14: row.atr14,
      relativeStrength: row.relativeStrength,
      volumeSma20: row.volumeSma20,
      volumeSpike: row.volumeSpike,
      breakoutDetected: row.breakoutDetected,
      breakoutType: row.breakoutType,
      computedAt: row.timestamp,
    };

    const responseData = {
      symbol,
      timeframe,
      source: 'database',
      indicators,
    };

    // Populate cache for 20s
    try {
      await redis.set(cacheKey, JSON.stringify(indicators), 'EX', 20);
    } catch(e) {}

    return NextResponse.json(responseData);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to retrieve indicators', details: error.message },
      { status: 500 },
    );
  }
}
