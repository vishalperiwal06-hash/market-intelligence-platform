import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { companies, ohlcCandles, corporateFilings, newsArticles } from '@/lib/db/schema';
import { eq, sql, asc, and, inArray, gte } from 'drizzle-orm';
import crypto from 'crypto';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';


// ──────────────────────────────────────────────
// PURE TECHNICAL INDICATOR MATH FUNCTIONS
// ──────────────────────────────────────────────
function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return new Array(prices.length).fill(NaN);
  const k = 2 / (period + 1);
  const ema: number[] = new Array(prices.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  ema[period - 1] = sum / period;
  for (let i = period; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calculateSMA(prices: number[], period: number): number[] {
  if (prices.length < period) return new Array(prices.length).fill(NaN);
  const sma: number[] = new Array(prices.length).fill(NaN);
  let windowSum = 0;
  for (let i = 0; i < period; i++) windowSum += prices[i];
  sma[period - 1] = windowSum / period;
  for (let i = period; i < prices.length; i++) {
    windowSum += prices[i] - prices[i - period];
    sma[i] = windowSum / period;
  }
  return sma;
}

function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return new Array(prices.length).fill(NaN);
  const rsi: number[] = new Array(prices.length).fill(NaN);
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rsi[i + 1] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

interface MACDResult {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
}
function calculateMACD(prices: number[]): MACDResult {
  const fastEMA = calculateEMA(prices, 12);
  const slowEMA = calculateEMA(prices, 26);
  const macdLine = prices.map((_, i) => {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) return NaN;
    return fastEMA[i] - slowEMA[i];
  });
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalFromValid = calculateEMA(validMacd, 9);
  const signalLine: number[] = new Array(prices.length).fill(NaN);
  let validIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (!isNaN(macdLine[i])) {
      signalLine[i] = signalFromValid[validIdx] ?? NaN;
      validIdx++;
    }
  }
  const histogram = prices.map((_, i) => {
    if (isNaN(macdLine[i]) || isNaN(signalLine[i])) return NaN;
    return macdLine[i] - signalLine[i];
  });
  return { macdLine, signalLine, histogram };
}

interface BollingerBandsResult {
  upper: number[];
  middle: number[];
  lower: number[];
}
function calculateBollingerBands(prices: number[]): BollingerBandsResult {
  const middle = calculateSMA(prices, 20);
  const upper: number[] = new Array(prices.length).fill(NaN);
  const lower: number[] = new Array(prices.length).fill(NaN);
  for (let i = 19; i < prices.length; i++) {
    const slice = prices.slice(i - 19, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    upper[i] = mean + 2 * stdDev;
    lower[i] = mean - 2 * stdDev;
  }
  return { upper, middle, lower };
}

// ──────────────────────────────────────────────
// DYNAMIC IN-MEMORY TIMEFRAME AGGREGATORS
// ──────────────────────────────────────────────
function aggregateCandles(bars: any[], factor: number): any[] {
  if (bars.length === 0) return [];
  if (factor <= 1) return bars;
  const result: any[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    let high = first.high;
    let low = first.low;
    let volume = 0;
    let turnover = 0;
    chunk.forEach((b) => {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      volume += Number(b.volume || 0);
      turnover += Number(b.turnover || 0);
    });
    result.push({
      symbol: first.symbol,
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
      turnover,
      bucketStart: first.bucketStart,
    });
  }
  return result;
}

function aggregateCandlesByCalendarDays(bars: any[], days: number): any[] {
  if (bars.length === 0) return [];
  const result: any[] = [];
  let currentGroup: any[] = [];
  let groupStartMs = 0;

  bars.forEach((b) => {
    const time = new Date(b.bucketStart).getTime();
    if (currentGroup.length === 0) {
      currentGroup.push(b);
      groupStartMs = time;
    } else if (time - groupStartMs < days * 24 * 60 * 60 * 1000) {
      currentGroup.push(b);
    } else {
      result.push(mergeGroup(currentGroup));
      currentGroup = [b];
      groupStartMs = time;
    }
  });

  if (currentGroup.length > 0) {
    result.push(mergeGroup(currentGroup));
  }

  return result;
}

function mergeGroup(chunk: any[]): any {
  const first = chunk[0];
  const last = chunk[chunk.length - 1];
  let high = first.high;
  let low = first.low;
  let volume = 0;
  let turnover = 0;
  chunk.forEach((b) => {
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
    volume += Number(b.volume || 0);
    turnover += Number(b.turnover || 0);
  });
  return {
    symbol: first.symbol,
    open: first.open,
    high,
    low,
    close: last.close,
    volume,
    turnover,
    bucketStart: first.bucketStart,
  };
}

// ──────────────────────────────────────────────
// DYNAMIC NICHE SECTORING INDEX
// ──────────────────────────────────────────────
function getNicheSectorAndIndustry(symbol: string, companyName: string): { sector: string; industry: string } {
  const sym = symbol.toUpperCase().trim();
  const name = companyName.toUpperCase().trim();

  // 1. Defense & Aerospace
  if (
    /HAL|BEL|BDL|MAZDOCK|GRSE|COCHINSHIP|PARAS|DATAPATTS|ZEN|BEML|ASTRAMICRO/.test(sym) ||
    /DEFENSE|DEFENCE|AEROSPACE|AERONAUTICS|SHIPBUILDERS|MICROWAVE|AVIONICS|AMMUNITION|ARMAMENT/.test(name)
  ) {
    return { sector: 'Defense & Aerospace', industry: 'Ammunition & Avionics' };
  }

  // 2. Railways & Infrastructure
  if (
    /IRCTC|RVNL|IRCON|RAILTEL|TEXRAIL|JWL|TITAGARH|RITES|KEC|LT|ENGINERSIN|IRFC/.test(sym) ||
    /RAIL|METRO|INFRASTRUCTURE|WAGON|LOCOMOTIVE|TRANSPORT|CARRIAGES|TRACKS/.test(name)
  ) {
    return { sector: 'Railways & Infrastructure', industry: 'Rolling Stock & Locomotives' };
  }

  // 3. Renewable Energy & Power
  if (
    /SUZLON|IREDA|SJVN|NHPC|POWERGRID|NTPC|TATAPOWER|ADANIGREEN|JSWENERGY|GENUSPOWER|KPI|GIPCL|BORORENEW|RECLTD|PFC/.test(sym) ||
    /POWER|GREEN ENERGY|SOLAR|WIND|RENEWABLE|HYDRO|ELECTRICITY|GENERATION/.test(name)
  ) {
    return { sector: 'Renewable Energy & Power', industry: 'Solar & Wind Energy' };
  }

  // 4. Banking & Financials
  if (
    /BANK|HDFCBANK|ICICIBANK|SBIN|AXISBANK|KOTAKBANK|INDUSINDBK|PNB|BOB|CANBK|UNIONBANK|IDFCFIRSTB|YESBANK|FEDERALBNK|BANDHANBNK|LIC|HDFC|MUTHOOTFIN|CHOLAFIN|BAJAJFINSV|BAJAJFINANCE|J&KBANK/.test(sym) ||
    /BANK|FINANCE|INVESTMENT|SECURITIES|INSURANCE|CAPITAL|LEASING|HOLDINGS|FINANCIAL/.test(name)
  ) {
    return { sector: 'Banking & Financials', industry: 'Public & Private Banks' };
  }

  // 5. AI & Information Technology
  if (
    /TCS|INFY|WIPRO|HCLTECH|TECHM|LTIM|PERSISTENT|COFORGE|KPITTECH|TATAELXSI|CYIENT|ZENSARTECH|SONATSOFTW|INTELLECT|MAPMYINDIA/.test(sym) ||
    /SOFTWARE|TECHNOLOGY|CONSULTANCY|DIGITAL|COMPUTERS|SYSTEMS|INFORMATION TECH|CYBER/.test(name)
  ) {
    return { sector: 'AI & Information Technology', industry: 'Generative AI & Cloud Services' };
  }

  // 6. Pharmaceuticals & Biotech
  if (
    /SUNPHARMA|CIPLA|DRREDDY|DIVISLAB|APOLLOHOSP|LUPIN|AUROPHARMA|BIOCON|GLAND|ZYDUSLIFE|LAURUSLABS|IPCALAB|GLAXO|ALKEM|ABBOTINDIA/.test(sym) ||
    /PHARMA|LABORATORIES|HEALTHCARE|DRUGS|BIOTECH|BIOLOGICALS|MEDICINE|CLINICAL/.test(name)
  ) {
    return { sector: 'Pharmaceuticals & Biotech', industry: 'Generics & API' };
  }

  // 7. Automobiles & EV
  if (
    /MARUTI|TATAMOTORS|M&M|HEROMOTOCO|BAJAJ-AUTO|EICHERMOT|TVSMOTOR|ASHOKLEY|BALKRISIND|MRF|APOLLOTYRE|SONACOMS|OLECTRA/.test(sym) ||
    /MOTORS|AUTOMOTIVE|TYRE|CYCLES|VEHICLES|EV COMPONENTS|AUTO ANCILLARY/.test(name)
  ) {
    return { sector: 'Automobiles & EV', industry: 'EVs & Auto Ancillary' };
  }

  // 8. Consumer FMCG
  if (
    /ITC|HINDUNILVR|NESTLEIND|BRITANNIA|COLPAL|DABUR|MARICO|TATACONSUM|GODREJCP|VBL|BALRAMCHIN|KRBL|TATAPLAY/.test(sym) ||
    /CONSUMER|FOODS|BEVERAGES|DAIRIES|SUGAR|FMCG|BREWERIES|DISTILLERIES|TOBACCO/.test(name)
  ) {
    return { sector: 'Consumer FMCG', industry: 'Food & Personal Care' };
  }

  // 9. Specialty Chemicals
  if (
    /SRF|TATACHEM|DEEPAKCTR|AARTIIND|FINEORG|GUJALKALI|VALIANTORG|FLUOROCHEM|CLEAN|ATUL|VINATIORG/.test(sym) ||
    /CHEMICALS|ORGANICS|ALKALIES|PETROCHEMICALS|FLUORINE|PIGMENTS/.test(name)
  ) {
    return { sector: 'Specialty Chemicals', industry: 'Fluorochemicals & Agro' };
  }

  // 10. Semiconductors & Electronics
  if (
    /DIXON|KAYNES|SYRMA|AVALON|SPEL|BEPL/.test(sym) ||
    /ELECTRONICS|SEMICONDUCTOR|HARDWARE|INSTRUMENTS|CABLES|WIRES/.test(name)
  ) {
    return { sector: 'Semiconductors & Electronics', industry: 'VLSI Design & ASIC' };
  }

  // 11. Metals & Mining
  if (
    /TATASTEEL|JSWSTEEL|HINDALCO|COALINDIA|VEDL|NMDC|SAIL|JINDALSTEL|HINDZINC/.test(sym) ||
    /STEEL|METALS|MINING|IRON|ALUMINIUM|COPPER|ZINC/.test(name)
  ) {
    return { sector: 'Metals & Mining', industry: 'Steel & Core Minerals' };
  }

  // 12. Oil & Gas / Energy
  if (
    /RELIANCE|ONGC|BPCL|IOC|GAIL|HPCL|OIL|PETRONET|MRPL|CHENNPETRO/.test(sym) ||
    /OIL|GAS|PETROLEUM|REFINERY|HYDROCARBONS|NATURAL GAS/.test(name)
  ) {
    return { sector: 'Oil & Gas / Energy', industry: 'Oil & Gas Extraction' };
  }

  return { sector: 'Infrastructure & Industry', industry: 'Engineering & Capital Goods' };
}


// ──────────────────────────────────────────────
// MAIN SCAN API ROUTE
// ──────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '1d';

    // Redis Cache lookup
    const cacheKey = `screener:scan:${timeframe}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    } catch (e) {}

    // Determine query timeframes and aggregations
    let queryTimeframe = '1d';
    let aggregationFactor = 1;
    let isCalendarAggregation = false;
    let calendarDays = 1;

    const tf = timeframe.toLowerCase();
    if (tf === '5m' || tf === '5minutes') {
      queryTimeframe = '5m';
    } else if (tf === '15m' || tf === '15minutes') {
      queryTimeframe = '15m';
    } else if (tf === '30m' || tf === '30minutes') {
      queryTimeframe = '15m';
      aggregationFactor = 2;
    } else if (tf === '1h' || tf === '1hour') {
      queryTimeframe = '1h';
    } else if (tf === '4h' || tf === '4hour') {
      queryTimeframe = '1h';
      aggregationFactor = 4;
    } else if (tf === '1d' || tf === 'daily') {
      queryTimeframe = '1d';
    } else if (tf === '1w' || tf === 'weekly') {
      queryTimeframe = '1d';
      isCalendarAggregation = true;
      calendarDays = 7;
    } else if (tf === '1m' || tf === 'monthly') {
      queryTimeframe = '1d';
      isCalendarAggregation = true;
      calendarDays = 30;
    } else if (tf === '1y' || tf === 'yearly') {
      queryTimeframe = '1d';
      isCalendarAggregation = true;
      calendarDays = 365;
    }

    // Fetch active companies first to construct active symbols filter
    const dbCompanies = await db.select({
      symbol: companies.symbol,
      name: companies.name,
      sector: companies.sector,
      industry: companies.industry,
      marketCap: companies.marketCap,
    })
    .from(companies)
    .where(eq(companies.isActive, true));

    const activeSymbols = dbCompanies.map(c => c.symbol.toUpperCase().trim());

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Fetch candles, filings, and news in parallel to optimize speed
    let candlesList: any[] = [];
    let recentFilings: any[] = [];
    let recentNews: any[] = [];

    if (activeSymbols.length > 0) {
      const [candlesRes, filingsRes, newsRes] = await Promise.all([
        db.select({
          symbol: ohlcCandles.symbol,
          open: ohlcCandles.open,
          high: ohlcCandles.high,
          low: ohlcCandles.low,
          close: ohlcCandles.close,
          volume: ohlcCandles.volume,
          turnover: ohlcCandles.turnover,
          bucketStart: ohlcCandles.bucketStart,
        })
        .from(ohlcCandles)
        .where(
          and(
            eq(ohlcCandles.timeframe, queryTimeframe),
            inArray(ohlcCandles.symbol, activeSymbols)
          )
        )
        .orderBy(asc(ohlcCandles.bucketStart)),

        db.select({
          symbol: corporateFilings.symbol,
          category: corporateFilings.category,
          subject: corporateFilings.subject,
          broadcastDate: corporateFilings.broadcastDate,
        })
        .from(corporateFilings)
        .where(gte(corporateFilings.broadcastDate, oneDayAgo)),

        db.select({
          title: newsArticles.title,
          symbols: newsArticles.symbols,
          pubDate: newsArticles.pubDate,
        })
        .from(newsArticles)
        .where(gte(newsArticles.pubDate, oneDayAgo))
      ]);

      candlesList = candlesRes;
      recentFilings = filingsRes;
      recentNews = newsRes;
    }

    // Group candles by symbol in memory
    const symbolCandlesMap = new Map<string, any[]>();
    candlesList.forEach((c) => {
      const sym = c.symbol.toUpperCase().trim();
      if (!symbolCandlesMap.has(sym)) {
        symbolCandlesMap.set(sym, []);
      }
      symbolCandlesMap.get(sym)!.push(c);
    });

    const now = new Date();
    const currentMinute = Math.floor(now.getTime() / 60000);

    // Filter out dirty spreadsheet header symbols
    const cleanCompanies = dbCompanies.filter(c => {
      const sym = c.symbol.toUpperCase().trim();
      const isValid = /^[A-Z0-9-]{2,15}$/.test(sym);
      const isHeader = /^(SYMBOL|SERIES|SECURITY|VOLUME|TURNOVER|CLOSE|OPEN|HIGH|LOW|CHANGE|EBITDA|SALES|DATE|% CHANGE|DEPRECIATION)$/.test(sym);
      return isValid && !isHeader;
    });

    // Map recent news by symbol for fast O(1) lookup
    const newsSymbolMap = new Map<string, any>();
    recentNews.forEach(n => {
      if (n.symbols && Array.isArray(n.symbols)) {
        n.symbols.forEach((sym: any) => {
          const symStr = String(sym).toUpperCase().trim();
          if (symStr) {
            newsSymbolMap.set(symStr, n);
          }
        });
      }
    });

    // Map recent filings by symbol for fast O(1) lookup
    const filingsSymbolMap = new Map<string, any>();
    recentFilings.forEach(f => {
      const symStr = f.symbol.toUpperCase().trim();
      if (symStr) {
        filingsSymbolMap.set(symStr, f);
      }
    });

    // Fetch all currently remembered catalyst stocks from Redis
    const rememberedMap = new Map<string, any>();
    try {
      const keys = await redis.keys('screener:remembered:*');
      if (keys.length > 0) {
        const values = await redis.mget(...keys);
        keys.forEach((key, idx) => {
          const sym = key.replace('screener:remembered:', '');
          const val = values[idx];
          if (val) {
            try {
              rememberedMap.set(sym, JSON.parse(val));
            } catch (e) {}
          }
        });
      }
    } catch (e) {
      console.warn('Failed to fetch remembered catalyst stocks from Redis:', e);
    }

    // Compute technical indicators in memory!
    const mergedRows = cleanCompanies.map((company) => {
      const symbol = company.symbol.toUpperCase().trim();
      const rawBars = symbolCandlesMap.get(symbol) || [];

      // Dynamic timeframe aggregation using genuine exchange candles only
      let bars = rawBars;
      if (aggregationFactor > 1) {
        bars = aggregateCandles(rawBars, aggregationFactor);
      } else if (isCalendarAggregation) {
        bars = aggregateCandlesByCalendarDays(rawBars, calendarDays);
      }

      // ZERO-FABRICATION: if no real candles exist, skip this symbol's indicators
      // — do not generate synthetic candles under any circumstances
      const closes = bars.map(b => Number(b.close));
      const volumes = bars.map(b => Number(b.volume || 0));
      const currentPrice: number | null = bars.length > 0 ? Number(bars[bars.length - 1].close) : null;

      // RSI — computed from real data only
      let rsi: number | null = null;
      if (closes.length >= 15) {
        const rsiArr = calculateRSI(closes, 14);
        const lastRsi = rsiArr[rsiArr.length - 1];
        rsi = (lastRsi !== undefined && !isNaN(lastRsi)) ? lastRsi : null;
      }

      // EMA — computed from real data only
      const calcEma = (period: number): number | null => {
        if (closes.length >= period) {
          const arr = calculateEMA(closes, period);
          const v = arr[arr.length - 1];
          return (v !== undefined && !isNaN(v)) ? v : null;
        }
        return null;
      };
      const ema9 = calcEma(9);
      const ema21 = calcEma(21) ?? calcEma(20);
      const ema50 = calcEma(50);
      const ema100 = calcEma(100);
      const ema200 = calcEma(200);

      // MACD — computed from real data only
      let macdLine: number | null = null;
      let macdSignal: number | null = null;
      let macdHistogram: number | null = null;
      if (closes.length >= 35) {
        const macdRes = calculateMACD(closes);
        const ml = macdRes.macdLine[macdRes.macdLine.length - 1];
        const ms = macdRes.signalLine[macdRes.signalLine.length - 1];
        const mh = macdRes.histogram[macdRes.histogram.length - 1];
        macdLine = (ml !== undefined && !isNaN(ml)) ? ml : null;
        macdSignal = (ms !== undefined && !isNaN(ms)) ? ms : null;
        macdHistogram = (mh !== undefined && !isNaN(mh)) ? mh : null;
      }

      // Bollinger Bands — computed from real data only
      let bbMiddle: number | null = null;
      let bbUpper: number | null = null;
      let bbLower: number | null = null;
      if (closes.length >= 20) {
        const bbRes = calculateBollingerBands(closes);
        const bbm = bbRes.middle[bbRes.middle.length - 1];
        const bbu = bbRes.upper[bbRes.upper.length - 1];
        const bbl = bbRes.lower[bbRes.lower.length - 1];
        bbMiddle = (bbm !== undefined && !isNaN(bbm)) ? bbm : null;
        bbUpper = (bbu !== undefined && !isNaN(bbu)) ? bbu : null;
        bbLower = (bbl !== undefined && !isNaN(bbl)) ? bbl : null;
      }

      // Volume Analytics — computed from real data only
      let avgVol: number | null = bars.length > 0 ? Number(bars[bars.length - 1].volume || 0) : null;
      let volumeSpike = false;
      let volMultiplier: number | null = null;
      if (volumes.length >= 20) {
        const smaVol = calculateSMA(volumes, 20);
        const lastSmaVol = smaVol[smaVol.length - 1];
        if (lastSmaVol > 0) {
          volMultiplier = Number((volumes[volumes.length - 1] / lastSmaVol).toFixed(2));
          volumeSpike = volumes[volumes.length - 1] >= lastSmaVol * 2.0;
        }
      }

      // Breakouts — computed from real data only
      let breakoutDetected = false;
      let breakoutType: string | null = null;
      if (bars.length >= 21) {
        const lookbackBars = bars.slice(-21);
        const window = lookbackBars.slice(0, 20);
        const current = lookbackBars[20];
        const highestHigh = Math.max(...window.map(b => Number(b.high)));
        const lowestLow = Math.min(...window.map(b => Number(b.low)));
        if (Number(current.close) > highestHigh) {
          breakoutDetected = true;
          breakoutType = 'resistance';
        } else if (Number(current.close) < lowestLow) {
          breakoutDetected = true;
          breakoutType = 'support';
        }
      }

      const sectorInfo = getNicheSectorAndIndustry(symbol, company.name || '');

      // Match real-time corporate action or news catalyst
      const filing = filingsSymbolMap.get(symbol);
      const newsItem = newsSymbolMap.get(symbol);
      let catalyst = null;

      if (filing) {
        catalyst = {
          type: 'filing',
          reason: `${filing.category}: ${filing.subject.slice(0, 75)}${filing.subject.length > 75 ? '...' : ''}`,
          title: filing.subject,
          date: filing.broadcastDate.toISOString()
        };
      } else if (newsItem) {
        catalyst = {
          type: 'news',
          reason: `${newsItem.title.slice(0, 80)}${newsItem.title.length > 80 ? '...' : ''}`,
          title: newsItem.title,
          date: newsItem.pubDate.toISOString()
        };
      }

      // Persistent catalyst memory detection & persistence
      const rememberedData = rememberedMap.get(symbol);
      let isRemembered = !!rememberedData;

      if (catalyst && volMultiplier !== null && (volMultiplier >= 2.0 || volumeSpike)) {
        const memoryKey = `screener:remembered:${symbol}`;
        const dayChangePercent = closes.length >= 2
          ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
          : 0;
        const memoryPayload = {
          symbol,
          companyName: company.name,
          catalyst,
          volMultiplier,
          price: currentPrice,
          changePercent: dayChangePercent,
          timestamp: new Date().toISOString(),
          reason: `[Significant Surge] ${catalyst.reason} with ${volMultiplier.toFixed(1)}x Volume Spike!`
        };
        redis.set(memoryKey, JSON.stringify(memoryPayload), 'EX', 86400).catch(err => {
          console.error(`Failed to store catalyst memory for ${symbol}:`, err);
        });
        rememberedMap.set(symbol, memoryPayload);
        isRemembered = true;
      }

      // Restore remembered catalyst from cache if no fresh exchange catalyst
      if (!catalyst && rememberedData) {
        catalyst = rememberedData.catalyst;
      }

      return {
        symbol,
        timeframe,
        timestamp: bars.length > 0 ? bars[bars.length - 1].bucketStart.toISOString() : now.toISOString(),
        rsi14: rsi,
        macdLine,
        macdSignal,
        macdHistogram,
        bbUpper,
        bbMiddle,
        bbLower,
        ema9,
        ema21,
        ema50,
        ema100,
        ema200,
        vwap: null,       // ZERO-FABRICATION: requires tick data — null when unavailable
        atr14: null,      // ZERO-FABRICATION: requires ATR from real candles — null when insufficient
        relativeStrength: null, // ZERO-FABRICATION: requires index comparison — null when unavailable
        volumeSma20: avgVol,
        volumeSpike,
        volMultiplier,
        breakoutDetected,
        breakoutType,
        companyName: company.name,
        sector: sectorInfo.sector,
        industry: sectorInfo.industry,
        marketCap: company.marketCap ?? null,
        catalyst,
        remembered: isRemembered,
        rememberedReason: rememberedMap.get(symbol)?.reason || (rememberedData ? rememberedData.reason : null),
      };
    });


    const responseData = {
      ok: true,
      data: mergedRows,
      remembered: Array.from(rememberedMap.values()),
      meta: {
        count: mergedRows.length,
        timeframe: queryTimeframe,
        requestedTimeframe: timeframe,
        engine: 'High-Fidelity Dynamic Timeframe In-Memory Ingestion Engine'
      }
    };

    // Cache results for 30 seconds for speed optimization
    try {
      await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 30);
    } catch (e) {}

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('Screener scan endpoint error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'SCREENER_SCAN_FAILED',
          message: 'Failed to retrieve scan results',
          details: error.message,
        },
      },
      { status: 500 }
    );
  }
}
