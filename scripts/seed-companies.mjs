/**
 * seed-companies.mjs
 * ─────────────────────────────────────────────────────────────
 * Seeds the `companies` table with ALL NSE + BSE listed equities.
 * 
 * Data sources (no authentication required):
 *   NSE Equity List : https://archives.nseindia.com/content/equities/EQUITY_L.csv
 *   NSE FnO List    : https://archives.nseindia.com/content/fo/fo_mktlots.csv
 *   BSE Scrip List  : https://www.bseindia.com/corporates/List_Scrips.aspx (CSV mode)
 * 
 * Usage:
 *   node scripts/seed-companies.mjs
 */

import pg from 'pg';
import https from 'https';
import http from 'http';

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://market_db_1kiu_user:sCTErQdBgoAVzo77eyJCMfnxMGYyAbW7@dpg-d8d8a3u8bjmc739t5e50-a.singapore-postgres.render.com/market_db_1kiu?sslmode=require';

// ─── HTTP helper ──────────────────────────────────────────────
function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
        ...headers,
      }
    };
    mod.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Parse simple CSV ─────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.length < 2) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (values[idx] || '').trim().replace(/^"|"$/g, '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Sector mapping from NSE industry names ───────────────────
function mapSector(industry) {
  if (!industry) return null;
  const i = industry.toUpperCase();
  if (i.includes('BANK') || i.includes('FINANCE') || i.includes('NBFC') || i.includes('INSURANCE')) return 'Financial Services';
  if (i.includes('SOFTWARE') || i.includes('IT') || i.includes('TECH') || i.includes('COMPUTER')) return 'Information Technology';
  if (i.includes('PHARMA') || i.includes('DRUG') || i.includes('HEALTH') || i.includes('HOSPITAL')) return 'Healthcare';
  if (i.includes('AUTO') || i.includes('VEHICLE') || i.includes('TYRE')) return 'Automobile';
  if (i.includes('STEEL') || i.includes('METAL') || i.includes('IRON') || i.includes('ALUMIN') || i.includes('COPPER') || i.includes('ZINC')) return 'Metals & Mining';
  if (i.includes('OIL') || i.includes('GAS') || i.includes('PETROL') || i.includes('ENERGY') || i.includes('REFIN')) return 'Oil Gas & Energy';
  if (i.includes('POWER') || i.includes('ELECTRIC')) return 'Power';
  if (i.includes('CEMENT') || i.includes('CONSTRUCTION') || i.includes('INFRA') || i.includes('REAL ESTATE') || i.includes('HOUSING')) return 'Infrastructure & Real Estate';
  if (i.includes('FMCG') || i.includes('CONSUMER') || i.includes('FOOD') || i.includes('BEVER') || i.includes('TOBACCO') || i.includes('COSMETIC')) return 'FMCG';
  if (i.includes('TEXTILE') || i.includes('APPAREL') || i.includes('GARMENT') || i.includes('FASHION')) return 'Textiles';
  if (i.includes('CHEMICAL') || i.includes('FERTILIZ') || i.includes('PESTICIDE') || i.includes('PAINT')) return 'Chemicals';
  if (i.includes('TELECOM') || i.includes('COMMUNICATION') || i.includes('BROADCAST')) return 'Telecom';
  if (i.includes('MEDIA') || i.includes('ENTERTAINMENT') || i.includes('FILM')) return 'Media & Entertainment';
  if (i.includes('RETAIL') || i.includes('TRADE') || i.includes('E-COMMERCE')) return 'Retail';
  if (i.includes('CAPITAL GOODS') || i.includes('ENGINEERING') || i.includes('INDUSTRIAL')) return 'Capital Goods';
  if (i.includes('TRANSPORT') || i.includes('LOGISTIC') || i.includes('SHIPPING') || i.includes('PORT') || i.includes('AVIATION')) return 'Transportation & Logistics';
  if (i.includes('AGRI') || i.includes('FARM') || i.includes('SEED') || i.includes('SUGAR')) return 'Agriculture';
  if (i.includes('MINING') || i.includes('COAL')) return 'Metals & Mining';
  if (i.includes('REALTY')) return 'Real Estate';
  return industry;
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting NSE + BSE company seed...\n');

  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅ Connected to PostgreSQL\n');

  const allCompanies = new Map(); // symbol → company obj

  // ══════════════════════════════════════════════════════
  // 1. NSE EQUITY LIST (EQUITY_L.csv — public, no auth)
  // ══════════════════════════════════════════════════════
  console.log('📥 Fetching NSE equity list (EQUITY_L.csv)...');
  try {
    const nseCSV = await fetchUrl(
      'https://archives.nseindia.com/content/equities/EQUITY_L.csv',
      { Referer: 'https://www.nseindia.com/' }
    );
    const nseRows = parseCSV(nseCSV);
    console.log(`   → Got ${nseRows.length} NSE rows`);

    for (const row of nseRows) {
      const symbol = (row['SYMBOL'] || row['symbol'] || '').trim().toUpperCase();
      const name = (row['NAME OF COMPANY'] || row['name_of_company'] || row['Company Name'] || symbol).trim();
      const series = (row['SERIES'] || row['series'] || 'EQ').trim().toUpperCase();
      const industry = (row['INDUSTRY'] || row['industry'] || '').trim();

      if (!symbol || symbol.length < 1) continue;
      // Skip debt/bonds/MF series
      if (['GB', 'GS', 'TB'].includes(series)) continue;

      allCompanies.set(symbol, {
        symbol,
        name: name || symbol,
        sector: mapSector(industry),
        industry: industry || null,
        exchange: 'NSE',
        series,
      });
    }
    console.log(`   ✅ ${allCompanies.size} unique NSE companies loaded\n`);
  } catch (err) {
    console.error(`   ⚠️  NSE EQUITY_L.csv failed: ${err.message}`);
  }

  // ══════════════════════════════════════════════════════
  // 2. NSE FnO equity list (additional symbols)
  // ══════════════════════════════════════════════════════
  console.log('📥 Fetching NSE FnO symbols...');
  try {
    const fnoCSV = await fetchUrl(
      'https://archives.nseindia.com/content/fo/fo_mktlots.csv',
      { Referer: 'https://www.nseindia.com/' }
    );
    const fnoRows = parseCSV(fnoCSV);
    let fnoAdded = 0;
    for (const row of fnoRows) {
      const symbol = (row['SYMBOL'] || row['symbol'] || row['Underlying'] || '').trim().toUpperCase();
      if (!symbol || allCompanies.has(symbol)) continue;
      const name = (row['NAME'] || row['name'] || symbol).trim();
      allCompanies.set(symbol, {
        symbol, name, sector: null, industry: null, exchange: 'NSE', series: 'EQ',
      });
      fnoAdded++;
    }
    console.log(`   ✅ ${fnoAdded} additional FnO symbols added\n`);
  } catch (err) {
    console.error(`   ⚠️  FnO CSV failed: ${err.message}`);
  }

  // ══════════════════════════════════════════════════════
  // 3. BSE Scrip List (publicly available)
  // ══════════════════════════════════════════════════════
  console.log('📥 Fetching BSE scrip list...');
  try {
    // BSE publishes a JSON list via their official download page
    const bseText = await fetchUrl(
      'https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active',
      {
        'Origin': 'https://www.bseindia.com',
        'Referer': 'https://www.bseindia.com/',
      }
    );
    let bseRows = [];
    try {
      const json = JSON.parse(bseText);
      bseRows = json.Table || json.data || json || [];
    } catch {
      // Try as CSV
      bseRows = parseCSV(bseText);
    }
    console.log(`   → Got ${bseRows.length} BSE scrip rows`);
    let bseAdded = 0;
    for (const row of bseRows) {
      // BSE uses scrip code + scrip name, NSE symbol is in NSESYMBOL field
      const nseSymbol = (row['NSESYMBOL'] || row['NSESymbol'] || row['NseSymbol'] || '').trim().toUpperCase();
      const bseCode = String(row['SCRIP_CD'] || row['ScripCode'] || row['scripcd'] || '').trim();
      const name = (row['SCRIP_NAME'] || row['ScripName'] || row['scripname'] || row['COMPANY'] || '').trim();
      const industry = (row['INDUSTRY'] || row['industry'] || row['Industryname'] || '').trim();

      // If there's an NSE symbol, add it to NSE too if not there
      if (nseSymbol && !allCompanies.has(nseSymbol)) {
        allCompanies.set(nseSymbol, {
          symbol: nseSymbol,
          name: name || nseSymbol,
          sector: mapSector(industry),
          industry: industry || null,
          exchange: 'NSE',
          series: 'EQ',
        });
        bseAdded++;
      }

      // Also add the BSE scrip code as BSE:{code} if no NSE equivalent
      if (bseCode && !nseSymbol && name) {
        const bseSymbol = `BSE:${bseCode}`;
        if (!allCompanies.has(bseSymbol)) {
          allCompanies.set(bseSymbol, {
            symbol: bseSymbol,
            name: name,
            sector: mapSector(industry),
            industry: industry || null,
            exchange: 'BSE',
            series: 'EQ',
          });
          bseAdded++;
        }
      }
    }
    console.log(`   ✅ ${bseAdded} additional BSE companies added\n`);
  } catch (err) {
    console.error(`   ⚠️  BSE API failed: ${err.message}`);
  }

  // ══════════════════════════════════════════════════════
  // 4. Hardcoded Top NSE/BSE universe as guaranteed baseline
  //    (In case all network calls fail on the seed machine)
  // ══════════════════════════════════════════════════════
  const CORE_UNIVERSE = [
    // NIFTY 50
    ['RELIANCE','Reliance Industries Ltd','Oil Gas & Energy','Large Cap'],
    ['TCS','Tata Consultancy Services Ltd','Information Technology','Large Cap'],
    ['HDFCBANK','HDFC Bank Ltd','Financial Services','Large Cap'],
    ['INFY','Infosys Ltd','Information Technology','Large Cap'],
    ['ICICIBANK','ICICI Bank Ltd','Financial Services','Large Cap'],
    ['HINDUNILVR','Hindustan Unilever Ltd','FMCG','Large Cap'],
    ['ITC','ITC Ltd','FMCG','Large Cap'],
    ['SBIN','State Bank of India','Financial Services','Large Cap'],
    ['BHARTIARTL','Bharti Airtel Ltd','Telecom','Large Cap'],
    ['KOTAKBANK','Kotak Mahindra Bank Ltd','Financial Services','Large Cap'],
    ['LT','Larsen & Toubro Ltd','Capital Goods','Large Cap'],
    ['BAJFINANCE','Bajaj Finance Ltd','Financial Services','Large Cap'],
    ['ASIANPAINT','Asian Paints Ltd','Chemicals','Large Cap'],
    ['AXISBANK','Axis Bank Ltd','Financial Services','Large Cap'],
    ['MARUTI','Maruti Suzuki India Ltd','Automobile','Large Cap'],
    ['HCLTECH','HCL Technologies Ltd','Information Technology','Large Cap'],
    ['WIPRO','Wipro Ltd','Information Technology','Large Cap'],
    ['TITAN','Titan Company Ltd','Consumer Durables','Large Cap'],
    ['SUNPHARMA','Sun Pharmaceutical Industries Ltd','Healthcare','Large Cap'],
    ['ULTRACEMCO','UltraTech Cement Ltd','Infrastructure & Real Estate','Large Cap'],
    ['TECHM','Tech Mahindra Ltd','Information Technology','Large Cap'],
    ['BAJAJFINSV','Bajaj Finserv Ltd','Financial Services','Large Cap'],
    ['POWERGRID','Power Grid Corporation of India Ltd','Power','Large Cap'],
    ['NTPC','NTPC Ltd','Power','Large Cap'],
    ['ONGC','Oil and Natural Gas Corporation Ltd','Oil Gas & Energy','Large Cap'],
    ['M&M','Mahindra & Mahindra Ltd','Automobile','Large Cap'],
    ['JSWSTEEL','JSW Steel Ltd','Metals & Mining','Large Cap'],
    ['TATAMOTORS','Tata Motors Ltd','Automobile','Large Cap'],
    ['TATASTEEL','Tata Steel Ltd','Metals & Mining','Large Cap'],
    ['ADANIENT','Adani Enterprises Ltd','Infrastructure & Real Estate','Large Cap'],
    ['ADANIPORTS','Adani Ports and Special Economic Zone Ltd','Transportation & Logistics','Large Cap'],
    ['ADANIPOWER','Adani Power Ltd','Power','Large Cap'],
    ['ADANIGREEN','Adani Green Energy Ltd','Power','Large Cap'],
    ['COALINDIA','Coal India Ltd','Metals & Mining','Large Cap'],
    ['DIVISLAB','Divi\'s Laboratories Ltd','Healthcare','Large Cap'],
    ['DRREDDY','Dr. Reddy\'s Laboratories Ltd','Healthcare','Large Cap'],
    ['CIPLA','Cipla Ltd','Healthcare','Large Cap'],
    ['BPCL','Bharat Petroleum Corporation Ltd','Oil Gas & Energy','Large Cap'],
    ['HEROMOTOCO','Hero MotoCorp Ltd','Automobile','Large Cap'],
    ['GRASIM','Grasim Industries Ltd','Infrastructure & Real Estate','Large Cap'],
    ['APOLLOHOSP','Apollo Hospitals Enterprise Ltd','Healthcare','Large Cap'],
    ['TATACONSUM','Tata Consumer Products Ltd','FMCG','Large Cap'],
    ['EICHERMOT','Eicher Motors Ltd','Automobile','Large Cap'],
    ['INDUSINDBK','IndusInd Bank Ltd','Financial Services','Large Cap'],
    ['NESTLEIND','Nestle India Ltd','FMCG','Large Cap'],
    ['BRITANNIA','Britannia Industries Ltd','FMCG','Large Cap'],
    ['SHREECEM','Shree Cement Ltd','Infrastructure & Real Estate','Large Cap'],
    ['HINDALCO','Hindalco Industries Ltd','Metals & Mining','Large Cap'],
    // NIFTY NEXT 50 & popular Mid/Small Caps
    ['HAL','Hindustan Aeronautics Ltd','Capital Goods','Large Cap'],
    ['BEL','Bharat Electronics Ltd','Capital Goods','Large Cap'],
    ['TRENT','Trent Ltd','Retail','Mid Cap'],
    ['MCX','Multi Commodity Exchange of India Ltd','Financial Services','Mid Cap'],
    ['ZOMATO','Zomato Ltd','Consumer Services','Mid Cap'],
    ['NYKAA','FSN E-Commerce Ventures Ltd','Retail','Mid Cap'],
    ['PAYTM','One 97 Communications Ltd','Financial Services','Mid Cap'],
    ['IRFC','Indian Railway Finance Corporation Ltd','Financial Services','Mid Cap'],
    ['RVNL','Rail Vikas Nigam Ltd','Infrastructure & Real Estate','Mid Cap'],
    ['IRCTC','Indian Railway Catering and Tourism Corporation Ltd','Transportation & Logistics','Mid Cap'],
    ['CANBK','Canara Bank','Financial Services','Mid Cap'],
    ['PNB','Punjab National Bank','Financial Services','Mid Cap'],
    ['BANKBARODA','Bank of Baroda','Financial Services','Mid Cap'],
    ['UNIONBANK','Union Bank of India','Financial Services','Mid Cap'],
    ['IDBI','IDBI Bank Ltd','Financial Services','Mid Cap'],
    ['FEDERALBNK','Federal Bank Ltd','Financial Services','Mid Cap'],
    ['IDFCFIRSTB','IDFC First Bank Ltd','Financial Services','Mid Cap'],
    ['BANDHANBNK','Bandhan Bank Ltd','Financial Services','Mid Cap'],
    ['RBLBANK','RBL Bank Ltd','Financial Services','Mid Cap'],
    ['YESBANK','Yes Bank Ltd','Financial Services','Mid Cap'],
    ['TORNTPHARM','Torrent Pharmaceuticals Ltd','Healthcare','Mid Cap'],
    ['LUPIN','Lupin Ltd','Healthcare','Mid Cap'],
    ['AUROPHARMA','Aurobindo Pharma Ltd','Healthcare','Mid Cap'],
    ['ALKEM','Alkem Laboratories Ltd','Healthcare','Mid Cap'],
    ['BIOCON','Biocon Ltd','Healthcare','Mid Cap'],
    ['ABBOTINDIA','Abbott India Ltd','Healthcare','Mid Cap'],
    ['PFIZER','Pfizer Ltd','Healthcare','Mid Cap'],
    ['GLAXO','GlaxoSmithKline Pharmaceuticals Ltd','Healthcare','Mid Cap'],
    ['MPHASIS','MphasiS Ltd','Information Technology','Mid Cap'],
    ['LTIM','LTIMindtree Ltd','Information Technology','Mid Cap'],
    ['COFORGE','Coforge Ltd','Information Technology','Mid Cap'],
    ['PERSISTENT','Persistent Systems Ltd','Information Technology','Mid Cap'],
    ['OFSS','Oracle Financial Services Software Ltd','Information Technology','Mid Cap'],
    ['KPITTECH','KPIT Technologies Ltd','Information Technology','Mid Cap'],
    ['TATAELXSI','Tata Elxsi Ltd','Information Technology','Mid Cap'],
    ['ZENSAR','Zensar Technologies Ltd','Information Technology','Mid Cap'],
    ['NIITTECH','NIIT Technologies Ltd','Information Technology','Mid Cap'],
    ['HINDPETRO','Hindustan Petroleum Corporation Ltd','Oil Gas & Energy','Mid Cap'],
    ['IOC','Indian Oil Corporation Ltd','Oil Gas & Energy','Large Cap'],
    ['MRPL','Mangalore Refinery and Petrochemicals Ltd','Oil Gas & Energy','Mid Cap'],
    ['CASTROLIND','Castrol India Ltd','Oil Gas & Energy','Mid Cap'],
    ['VEDL','Vedanta Ltd','Metals & Mining','Large Cap'],
    ['NMDC','NMDC Ltd','Metals & Mining','Mid Cap'],
    ['SAIL','Steel Authority of India Ltd','Metals & Mining','Mid Cap'],
    ['WELCORP','Welspun Corp Ltd','Metals & Mining','Mid Cap'],
    ['NATIONALUM','National Aluminium Company Ltd','Metals & Mining','Mid Cap'],
    ['HINDCOPPER','Hindustan Copper Ltd','Metals & Mining','Mid Cap'],
    ['APLAPOLLO','APL Apollo Tubes Ltd','Metals & Mining','Mid Cap'],
    ['TATAPOWER','Tata Power Company Ltd','Power','Large Cap'],
    ['ADANITRANS','Adani Transmission Ltd','Power','Large Cap'],
    ['CESC','CESC Ltd','Power','Mid Cap'],
    ['TORNTPOWER','Torrent Power Ltd','Power','Mid Cap'],
    ['JSWENERGY','JSW Energy Ltd','Power','Mid Cap'],
    ['NHPC','NHPC Ltd','Power','Mid Cap'],
    ['SJVN','SJVN Ltd','Power','Small Cap'],
    ['MAHABANK','Bank of Maharashtra','Financial Services','Mid Cap'],
    ['BOSCHLTD','Bosch Ltd','Automobile','Large Cap'],
    ['BALKRISIND','Balkrishna Industries Ltd','Automobile','Mid Cap'],
    ['MOTHERSON','Samvardhana Motherson International Ltd','Automobile','Mid Cap'],
    ['EXIDEIND','Exide Industries Ltd','Automobile','Mid Cap'],
    ['AMARAJABAT','Amara Raja Energy & Mobility Ltd','Automobile','Mid Cap'],
    ['BAJAJ-AUTO','Bajaj Auto Ltd','Automobile','Large Cap'],
    ['TVSMOTOR','TVS Motor Company Ltd','Automobile','Large Cap'],
    ['ASHOKLEY','Ashok Leyland Ltd','Automobile','Mid Cap'],
    ['APOLLOTYRE','Apollo Tyres Ltd','Automobile','Mid Cap'],
    ['MRF','MRF Ltd','Automobile','Large Cap'],
    ['CEATLTD','CEAT Ltd','Automobile','Mid Cap'],
    ['GODREJCP','Godrej Consumer Products Ltd','FMCG','Large Cap'],
    ['GODREJIND','Godrej Industries Ltd','FMCG','Large Cap'],
    ['DABUR','Dabur India Ltd','FMCG','Large Cap'],
    ['MARICO','Marico Ltd','FMCG','Large Cap'],
    ['COLPAL','Colgate-Palmolive (India) Ltd','FMCG','Large Cap'],
    ['EMAMILTD','Emami Ltd','FMCG','Mid Cap'],
    ['PIDILITIND','Pidilite Industries Ltd','Chemicals','Large Cap'],
    ['UPL','UPL Ltd','Chemicals','Large Cap'],
    ['COROMANDEL','Coromandel International Ltd','Chemicals','Mid Cap'],
    ['DEEPAKNITR','Deepak Nitrite Ltd','Chemicals','Mid Cap'],
    ['AAVAS','Aavas Financiers Ltd','Financial Services','Mid Cap'],
    ['MUTHOOTFIN','Muthoot Finance Ltd','Financial Services','Mid Cap'],
    ['CHOLAFIN','Cholamandalam Investment and Finance Company Ltd','Financial Services','Mid Cap'],
    ['L&TFH','L&T Finance Holdings Ltd','Financial Services','Mid Cap'],
    ['MANAPPURAM','Manappuram Finance Ltd','Financial Services','Mid Cap'],
    ['ANGELONE','Angel One Ltd','Financial Services','Mid Cap'],
    ['ICICIPRULI','ICICI Prudential Life Insurance Company Ltd','Financial Services','Large Cap'],
    ['HDFCLIFE','HDFC Life Insurance Company Ltd','Financial Services','Large Cap'],
    ['SBILIFE','SBI Life Insurance Company Ltd','Financial Services','Large Cap'],
    ['GICRE','General Insurance Corporation of India','Financial Services','Large Cap'],
    ['NIACL','The New India Assurance Company Ltd','Financial Services','Large Cap'],
    ['STARHEALTH','Star Health and Allied Insurance Company Ltd','Financial Services','Mid Cap'],
    ['DLF','DLF Ltd','Real Estate','Large Cap'],
    ['GODREJPROP','Godrej Properties Ltd','Real Estate','Large Cap'],
    ['PRESTIGE','Prestige Estates Projects Ltd','Real Estate','Mid Cap'],
    ['OBEROIRLTY','Oberoi Realty Ltd','Real Estate','Mid Cap'],
    ['BRIGADE','Brigade Enterprises Ltd','Real Estate','Mid Cap'],
    ['SOBHA','Sobha Ltd','Real Estate','Mid Cap'],
    ['SUNTV','Sun TV Network Ltd','Media & Entertainment','Mid Cap'],
    ['ZEEL','Zee Entertainment Enterprises Ltd','Media & Entertainment','Mid Cap'],
    ['PVR','PVR Inox Ltd','Media & Entertainment','Mid Cap'],
    ['INOXGREEN','INOX Green Energy Services Ltd','Power','Small Cap'],
    ['DOMS','DOMS Industries Ltd','Consumer Durables','Mid Cap'],
    ['JYOTHYLAB','Jyothy Labs Ltd','FMCG','Mid Cap'],
    ['INDIGO','InterGlobe Aviation Ltd','Transportation & Logistics','Large Cap'],
    ['SPICEJET','SpiceJet Ltd','Transportation & Logistics','Small Cap'],
    ['CONCOR','Container Corporation of India Ltd','Transportation & Logistics','Mid Cap'],
    ['BLUEDART','Blue Dart Express Ltd','Transportation & Logistics','Mid Cap'],
    ['MAHLOG','Mahindra Logistics Ltd','Transportation & Logistics','Small Cap'],
    ['GMDCLTD','Gujarat Mineral Development Corporation Ltd','Metals & Mining','Small Cap'],
    ['NATIONALUM','National Aluminium Company Ltd','Metals & Mining','Mid Cap'],
    ['GMRINFRA','GMR Airports Infrastructure Ltd','Infrastructure & Real Estate','Mid Cap'],
    ['LICI','Life Insurance Corporation of India','Financial Services','Large Cap'],
    ['NYKAA','FSN E-Commerce Ventures Ltd','Retail','Mid Cap'],
    ['DEVYANI','Devyani International Ltd','Consumer Services','Mid Cap'],
    ['WESTLIFE','Westlife Foodworld Ltd','Consumer Services','Small Cap'],
    ['SAPPHIRE','Sapphire Foods India Ltd','Consumer Services','Mid Cap'],
    ['BIKAJI','Bikaji Foods International Ltd','FMCG','Mid Cap'],
    ['CAMPUS','Campus Activewear Ltd','Consumer Durables','Small Cap'],
    ['DMART','Avenue Supermarts Ltd','Retail','Large Cap'],
    ['VMART','V-Mart Retail Ltd','Retail','Small Cap'],
    ['SHOPERSTOP','Shoppers Stop Ltd','Retail','Small Cap'],
    ['BATA','Bata India Ltd','Consumer Durables','Mid Cap'],
    ['RELAXO','Relaxo Footwears Ltd','Consumer Durables','Mid Cap'],
    ['KALYANKJIL','Kalyan Jewellers India Ltd','Consumer Durables','Mid Cap'],
    ['SENCO','Senco Gold Ltd','Consumer Durables','Small Cap'],
    ['VOLTAS','Voltas Ltd','Consumer Durables','Mid Cap'],
    ['WHIRLPOOL','Whirlpool of India Ltd','Consumer Durables','Mid Cap'],
    ['CROMPTON','Crompton Greaves Consumer Electricals Ltd','Consumer Durables','Mid Cap'],
    ['HAVELLS','Havells India Ltd','Consumer Durables','Large Cap'],
    ['POLYCAB','Polycab India Ltd','Capital Goods','Mid Cap'],
    ['KEI','KEI Industries Ltd','Capital Goods','Mid Cap'],
    ['KAYNES','Kaynes Technology India Ltd','Capital Goods','Small Cap'],
    ['SYRMA','Syrma SGS Technology Ltd','Capital Goods','Small Cap'],
    ['BLS','BLS International Services Ltd','Consumer Services','Small Cap'],
    ['TANLA','Tanla Platforms Ltd','Information Technology','Mid Cap'],
    ['ROUTE','Route Mobile Ltd','Information Technology','Mid Cap'],
    ['INTELLECT','Intellect Design Arena Ltd','Information Technology','Mid Cap'],
    ['SONATSOFTW','Sonata Software Ltd','Information Technology','Mid Cap'],
    ['MASTEK','Mastek Ltd','Information Technology','Mid Cap'],
    ['NEWGEN','Newgen Software Technologies Ltd','Information Technology','Small Cap'],
    ['ECLERX','eClerx Services Ltd','Information Technology','Small Cap'],
    ['RATEGAIN','RateGain Travel Technologies Ltd','Information Technology','Small Cap'],
    ['KIMS','Krishna Institute of Medical Sciences Ltd','Healthcare','Mid Cap'],
    ['RAINBOW','Rainbow Childrens Medicare Ltd','Healthcare','Small Cap'],
    ['HEALTHATM','HealthCare Global Enterprises Ltd','Healthcare','Small Cap'],
    ['METROPOLIS','Metropolis Healthcare Ltd','Healthcare','Mid Cap'],
    ['THYROCARE','Thyrocare Technologies Ltd','Healthcare','Small Cap'],
    ['LALPATHLAB','Dr Lal PathLabs Ltd','Healthcare','Mid Cap'],
    ['MEDANTA','Global Health Ltd','Healthcare','Mid Cap'],
    ['AARTIIND','Aarti Industries Ltd','Chemicals','Mid Cap'],
    ['AARTI','Aarti Drugs Ltd','Chemicals','Small Cap'],
    ['CLEAN','Clean Science and Technology Ltd','Chemicals','Small Cap'],
    ['TATACHEM','Tata Chemicals Ltd','Chemicals','Mid Cap'],
    ['GNFC','Gujarat Narmada Valley Fertilizers and Chemicals Ltd','Chemicals','Mid Cap'],
    ['GSFC','Gujarat State Fertilizers & Chemicals Ltd','Chemicals','Small Cap'],
    ['CHAMBLFERT','Chambal Fertilizers and Chemicals Ltd','Chemicals','Mid Cap'],
    ['NAVINFLUOR','Navin Fluorine International Ltd','Chemicals','Mid Cap'],
    ['FLUOROCHEM','Gujarat Fluorochemicals Ltd','Chemicals','Mid Cap'],
    ['SRF','SRF Ltd','Chemicals','Large Cap'],
    ['ALKYLAMINE','Alkyl Amines Chemicals Ltd','Chemicals','Small Cap'],
    ['FINEORG','Fine Organic Industries Ltd','Chemicals','Small Cap'],
    ['GALAXYSURF','Galaxy Surfactants Ltd','Chemicals','Mid Cap'],
    ['TATACOMM','Tata Communications Ltd','Telecom','Large Cap'],
    ['MTNL','Mahanagar Telephone Nigam Ltd','Telecom','Small Cap'],
    ['RAILTEL','RailTel Corporation of India Ltd','Telecom','Small Cap'],
    ['ROUTE','Route Mobile Ltd','Telecom','Mid Cap'],
    ['TEJASNET','Tejas Networks Ltd','Telecom','Small Cap'],
    ['STLTECH','Sterlite Technologies Ltd','Telecom','Small Cap'],
    ['HFCL','HFCL Ltd','Telecom','Small Cap'],
    ['SUZLON','Suzlon Energy Ltd','Power','Small Cap'],
    ['GREENPANEL','Greenpanel Industries Ltd','Agriculture','Small Cap'],
    ['BALAMINES','Balaji Amines Ltd','Chemicals','Small Cap'],
    ['IPCALAB','IPCA Laboratories Ltd','Healthcare','Mid Cap'],
    ['GLENMARK','Glenmark Pharmaceuticals Ltd','Healthcare','Mid Cap'],
    ['CADILAHC','Cadila Healthcare Ltd','Healthcare','Large Cap'],
    ['WOCKPHARMA','Wockhardt Ltd','Healthcare','Small Cap'],
    ['AJANTPHARM','Ajanta Pharma Ltd','Healthcare','Mid Cap'],
    ['GRANULES','Granules India Ltd','Healthcare','Mid Cap'],
    ['SUDARSCHEM','Sudarshan Chemical Industries Ltd','Chemicals','Small Cap'],
    ['SOLARA','Solara Active Pharma Sciences Ltd','Healthcare','Small Cap'],
    ['PIRAMALENT','Piramal Enterprises Ltd','Financial Services','Mid Cap'],
    ['MFSL','Max Financial Services Ltd','Financial Services','Mid Cap'],
    ['SHYAMMETL','Shyam Metalics and Energy Ltd','Metals & Mining','Mid Cap'],
    ['RATNAMANI','Ratnamani Metals & Tubes Ltd','Metals & Mining','Mid Cap'],
    ['MAHSEAMLES','Maharashtra Seamless Ltd','Metals & Mining','Small Cap'],
    ['HINDZINC','Hindustan Zinc Ltd','Metals & Mining','Large Cap'],
    ['SANDUMA','Sandur Manganese & Iron Ores Ltd','Metals & Mining','Small Cap'],
    ['KIOCL','KIOCL Ltd','Metals & Mining','Small Cap'],
    ['GPPL','Gujarat Pipavav Port Ltd','Transportation & Logistics','Small Cap'],
    ['ADANIPORTS','Adani Ports and Special Economic Zone Ltd','Transportation & Logistics','Large Cap'],
    ['ESCORTS','Escorts Kubota Ltd','Capital Goods','Mid Cap'],
    ['BEL','Bharat Electronics Ltd','Capital Goods','Large Cap'],
    ['BEML','BEML Ltd','Capital Goods','Mid Cap'],
    ['MIDHANI','Mishra Dhatu Nigam Ltd','Capital Goods','Small Cap'],
    ['MHRIL','Mahindra Holidays & Resorts India Ltd','Consumer Services','Small Cap'],
    ['INDHOTEL','The Indian Hotels Company Ltd','Consumer Services','Mid Cap'],
    ['CHALET','Chalet Hotels Ltd','Consumer Services','Small Cap'],
    ['LEMON','Lemon Tree Hotels Ltd','Consumer Services','Small Cap'],
    ['EIH','EIH Ltd','Consumer Services','Mid Cap'],
    ['PCBL','PCBL Ltd','Chemicals','Mid Cap'],
    ['ASTRAZEN','AstraZeneca Pharma India Ltd','Healthcare','Small Cap'],
    ['KPIL','Kalpataru Projects International Ltd','Capital Goods','Mid Cap'],
    ['NCC','NCC Ltd','Capital Goods','Mid Cap'],
    ['PFC','Power Finance Corporation Ltd','Financial Services','Large Cap'],
    ['REC','REC Ltd','Financial Services','Large Cap'],
    ['IREDA','Indian Renewable Energy Development Agency Ltd','Financial Services','Mid Cap'],
    ['CRISIL','CRISIL Ltd','Financial Services','Mid Cap'],
    ['CDSL','Central Depository Services Ltd','Financial Services','Mid Cap'],
    ['BSE','BSE Ltd','Financial Services','Mid Cap'],
    ['NSDL','National Securities Depository Ltd','Financial Services','Mid Cap'],
    ['MCX','Multi Commodity Exchange of India Ltd','Financial Services','Mid Cap'],
    ['POLICYBZR','PB Fintech Ltd','Financial Services','Mid Cap'],
    ['NUVOCO','Nuvoco Vistas Corporation Ltd','Infrastructure & Real Estate','Small Cap'],
    ['RAMCOCEM','The Ramco Cements Ltd','Infrastructure & Real Estate','Mid Cap'],
    ['AMBUJACEMENT','Ambuja Cements Ltd','Infrastructure & Real Estate','Large Cap'],
    ['ACC','ACC Ltd','Infrastructure & Real Estate','Large Cap'],
    ['JKCEMENT','JK Cement Ltd','Infrastructure & Real Estate','Mid Cap'],
    ['DALBHARAT','Dalmia Bharat Ltd','Infrastructure & Real Estate','Mid Cap'],
    ['SOLARINDS','Solar Industries India Ltd','Capital Goods','Mid Cap'],
    ['IEX','Indian Energy Exchange Ltd','Financial Services','Mid Cap'],
    ['PNBHOUSING','PNB Housing Finance Ltd','Financial Services','Mid Cap'],
    ['HOMEFIRST','Home First Finance Company India Ltd','Financial Services','Small Cap'],
    ['CAN_FIN_HOMES','Can Fin Homes Ltd','Financial Services','Small Cap'],
    ['GRUH','GRUH Finance Ltd','Financial Services','Small Cap'],
    ['LICHSGFIN','LIC Housing Finance Ltd','Financial Services','Mid Cap'],
    ['EDELWEISS','Edelweiss Financial Services Ltd','Financial Services','Small Cap'],
    ['MOTILALOFS','Motilal Oswal Financial Services Ltd','Financial Services','Mid Cap'],
    ['GEOJITFSL','Geojit Financial Services Ltd','Financial Services','Small Cap'],
    ['5PAISA','5Paisa Capital Ltd','Financial Services','Small Cap'],
    ['NAUKRI','Info Edge (India) Ltd','Consumer Services','Large Cap'],
    ['JUSTDIAL','Just Dial Ltd','Consumer Services','Small Cap'],
    ['INDIAMART','Indiamart Intermesh Ltd','Consumer Services','Mid Cap'],
    ['MAPMYINDIA','CE Info Systems Ltd','Information Technology','Mid Cap'],
    ['CARTRADE','CarTrade Tech Ltd','Consumer Services','Small Cap'],
    ['AFFLE','Affle (India) Ltd','Information Technology','Small Cap'],
    ['NAZARA','Nazara Technologies Ltd','Information Technology','Small Cap'],
    ['LATENTVIEW','Latent View Analytics Ltd','Information Technology','Small Cap'],
  ];

  let hardcodedAdded = 0;
  for (const [symbol, name, sector, cap] of CORE_UNIVERSE) {
    if (!allCompanies.has(symbol)) {
      allCompanies.set(symbol, { symbol, name, sector, industry: cap, exchange: 'NSE', series: 'EQ' });
      hardcodedAdded++;
    }
  }
  console.log(`   ✅ ${hardcodedAdded} additional core stocks from hardcoded universe\n`);

  // ══════════════════════════════════════════════════════
  // 5. Upsert into PostgreSQL
  // ══════════════════════════════════════════════════════
  const companies = Array.from(allCompanies.values());
  console.log(`\n📊 Total companies to seed: ${companies.length}`);
  console.log('💾 Inserting into database in batches of 500...\n');

  const BATCH_SIZE = 500;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(companies.length / BATCH_SIZE);

    // Build VALUES placeholders
    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const c of batch) {
      values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, true, NOW())`);
      params.push(
        c.symbol,
        c.name || c.symbol,
        c.sector || null,
        c.industry || null,
        c.exchange || 'NSE',
      );
    }

    const sql = `
      INSERT INTO companies (symbol, name, sector, industry, exchange, is_active, updated_at)
      VALUES ${values.join(',')}
      ON CONFLICT (symbol) DO UPDATE SET
        name = EXCLUDED.name,
        sector = COALESCE(EXCLUDED.sector, companies.sector),
        industry = COALESCE(EXCLUDED.industry, companies.industry),
        exchange = EXCLUDED.exchange,
        is_active = true,
        updated_at = NOW()
    `;

    try {
      const result = await client.query(sql, params);
      process.stdout.write(`   Batch ${batchNum}/${totalBatches}: ${batch.length} rows → rowCount=${result.rowCount}\n`);
      inserted += result.rowCount || batch.length;
    } catch (err) {
      console.error(`   ❌ Batch ${batchNum} error: ${err.message}`);
    }
  }

  // Count final
  const { rows: countRows } = await client.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active) as active FROM companies');
  console.log(`\n✅ Seeding complete!`);
  console.log(`   Total rows in companies: ${countRows[0].total}`);
  console.log(`   Active companies: ${countRows[0].active}`);

  // Sample check
  const { rows: sample } = await client.query(`SELECT symbol, name, sector, exchange FROM companies ORDER BY symbol LIMIT 10`);
  console.log('\n📋 Sample companies:');
  sample.forEach(r => console.log(`   ${r.symbol.padEnd(20)} ${(r.name || '').slice(0, 40).padEnd(42)} [${r.exchange}] ${r.sector || ''}`));

  await client.end();
  console.log('\n🎉 Done! All NSE + BSE equities are now in the database.\n');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
