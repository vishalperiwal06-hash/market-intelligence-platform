"""
seed_nse_bse_companies.py
Seeds the companies table with ALL NSE + BSE listed equities.

Sources (no auth required):
  NSE: https://archives.nseindia.com/content/equities/EQUITY_L.csv
  BSE: https://api.bseindia.com/...

Usage:
  pip install psycopg2-binary
  python scripts/seed_nse_bse_companies.py
"""
import os, sys, csv, json, io, ssl
import urllib.request

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://market_db_1kiu_user:sCTErQdBgoAVzo77eyJCMfnxMGYyAbW7@dpg-d8d8a3u8bjmc739t5e50-a.singapore-postgres.render.com/market_db_1kiu'
)

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print('psycopg2 not found. Install with: pip install psycopg2-binary')
    sys.exit(1)


def fetch_url(url, headers=None, timeout=30):
    default_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
    }
    if headers:
        default_headers.update(headers)
    req = urllib.request.Request(url, headers=default_headers)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='replace')


def parse_csv_text(text):
    reader = csv.DictReader(io.StringIO(text.strip()))
    return [dict(row) for row in reader]


def map_sector(industry):
    if not industry:
        return None
    i = industry.upper()
    if any(k in i for k in ['BANK', 'FINANCE', 'NBFC', 'INSURANCE', 'FINTECH']):
        return 'Financial Services'
    if any(k in i for k in ['SOFTWARE', ' IT ', 'TECH', 'COMPUTER', 'INFORMATION TECHNOLOGY']):
        return 'Information Technology'
    if any(k in i for k in ['PHARMA', 'DRUG', 'HEALTH', 'HOSPITAL', 'MEDICAL']):
        return 'Healthcare'
    if any(k in i for k in ['AUTO', 'VEHICLE', 'TYRE', 'AUTOMOBILE']):
        return 'Automobile'
    if any(k in i for k in ['STEEL', 'METAL', 'IRON', 'ALUMIN', 'COPPER', 'ZINC', 'MINING']):
        return 'Metals & Mining'
    if any(k in i for k in ['OIL', 'GAS', 'PETROL', 'REFIN']):
        return 'Oil Gas & Energy'
    if any(k in i for k in ['POWER', 'ELECTRIC', 'SOLAR', 'WIND', 'RENEWABLE']):
        return 'Power'
    if any(k in i for k in ['CEMENT', 'CONSTRUCT', 'INFRA', 'REAL ESTATE', 'HOUSING', 'REALTY']):
        return 'Infrastructure & Real Estate'
    if any(k in i for k in ['FMCG', 'CONSUMER GOODS', 'FOOD', 'BEVER', 'TOBACCO', 'COSMETIC']):
        return 'FMCG'
    if any(k in i for k in ['TEXTILE', 'APPAREL', 'GARMENT', 'FASHION']):
        return 'Textiles'
    if any(k in i for k in ['CHEMICAL', 'FERTILIZ', 'PESTICIDE', 'PAINT']):
        return 'Chemicals'
    if any(k in i for k in ['TELECOM', 'COMMUNICATION', 'BROADCAST']):
        return 'Telecom'
    if any(k in i for k in ['MEDIA', 'ENTERTAINMENT', 'FILM']):
        return 'Media & Entertainment'
    if any(k in i for k in ['RETAIL', 'TRADE', 'E-COMMERCE']):
        return 'Retail'
    if any(k in i for k in ['CAPITAL GOODS', 'ENGINEERING', 'INDUSTRIAL']):
        return 'Capital Goods'
    if any(k in i for k in ['TRANSPORT', 'LOGISTIC', 'SHIPPING', 'PORT', 'AVIATION', 'RAILWAY']):
        return 'Transportation & Logistics'
    if any(k in i for k in ['AGRI', 'FARM', 'SEED', 'SUGAR']):
        return 'Agriculture'
    return industry.title()


CORE_UNIVERSE = [
    ('RELIANCE','Reliance Industries Ltd','Oil Gas & Energy'),
    ('TCS','Tata Consultancy Services Ltd','Information Technology'),
    ('HDFCBANK','HDFC Bank Ltd','Financial Services'),
    ('INFY','Infosys Ltd','Information Technology'),
    ('ICICIBANK','ICICI Bank Ltd','Financial Services'),
    ('HINDUNILVR','Hindustan Unilever Ltd','FMCG'),
    ('ITC','ITC Ltd','FMCG'),
    ('SBIN','State Bank of India','Financial Services'),
    ('BHARTIARTL','Bharti Airtel Ltd','Telecom'),
    ('KOTAKBANK','Kotak Mahindra Bank Ltd','Financial Services'),
    ('LT','Larsen & Toubro Ltd','Capital Goods'),
    ('BAJFINANCE','Bajaj Finance Ltd','Financial Services'),
    ('ASIANPAINT','Asian Paints Ltd','Chemicals'),
    ('AXISBANK','Axis Bank Ltd','Financial Services'),
    ('MARUTI','Maruti Suzuki India Ltd','Automobile'),
    ('HCLTECH','HCL Technologies Ltd','Information Technology'),
    ('WIPRO','Wipro Ltd','Information Technology'),
    ('TITAN','Titan Company Ltd','Consumer Durables'),
    ('SUNPHARMA','Sun Pharmaceutical Industries Ltd','Healthcare'),
    ('ULTRACEMCO','UltraTech Cement Ltd','Infrastructure & Real Estate'),
    ('TECHM','Tech Mahindra Ltd','Information Technology'),
    ('BAJAJFINSV','Bajaj Finserv Ltd','Financial Services'),
    ('POWERGRID','Power Grid Corporation of India Ltd','Power'),
    ('NTPC','NTPC Ltd','Power'),
    ('ONGC','Oil and Natural Gas Corporation Ltd','Oil Gas & Energy'),
    ('M&M','Mahindra & Mahindra Ltd','Automobile'),
    ('JSWSTEEL','JSW Steel Ltd','Metals & Mining'),
    ('TATAMOTORS','Tata Motors Ltd','Automobile'),
    ('TATASTEEL','Tata Steel Ltd','Metals & Mining'),
    ('ADANIENT','Adani Enterprises Ltd','Infrastructure & Real Estate'),
    ('ADANIPORTS','Adani Ports and Special Economic Zone Ltd','Transportation & Logistics'),
    ('ADANIPOWER','Adani Power Ltd','Power'),
    ('ADANIGREEN','Adani Green Energy Ltd','Power'),
    ('COALINDIA','Coal India Ltd','Metals & Mining'),
    ('DIVISLAB',"Divi's Laboratories Ltd",'Healthcare'),
    ('DRREDDY',"Dr. Reddy's Laboratories Ltd",'Healthcare'),
    ('CIPLA','Cipla Ltd','Healthcare'),
    ('BPCL','Bharat Petroleum Corporation Ltd','Oil Gas & Energy'),
    ('HEROMOTOCO','Hero MotoCorp Ltd','Automobile'),
    ('GRASIM','Grasim Industries Ltd','Infrastructure & Real Estate'),
    ('APOLLOHOSP','Apollo Hospitals Enterprise Ltd','Healthcare'),
    ('TATACONSUM','Tata Consumer Products Ltd','FMCG'),
    ('EICHERMOT','Eicher Motors Ltd','Automobile'),
    ('INDUSINDBK','IndusInd Bank Ltd','Financial Services'),
    ('NESTLEIND','Nestle India Ltd','FMCG'),
    ('BRITANNIA','Britannia Industries Ltd','FMCG'),
    ('SHREECEM','Shree Cement Ltd','Infrastructure & Real Estate'),
    ('HINDALCO','Hindalco Industries Ltd','Metals & Mining'),
    ('HAL','Hindustan Aeronautics Ltd','Capital Goods'),
    ('BEL','Bharat Electronics Ltd','Capital Goods'),
    ('TRENT','Trent Ltd','Retail'),
    ('MCX','Multi Commodity Exchange of India Ltd','Financial Services'),
    ('ZOMATO','Zomato Ltd','Consumer Services'),
    ('IRFC','Indian Railway Finance Corporation Ltd','Financial Services'),
    ('RVNL','Rail Vikas Nigam Ltd','Infrastructure & Real Estate'),
    ('IRCTC','Indian Railway Catering and Tourism Corporation Ltd','Transportation & Logistics'),
    ('CANBK','Canara Bank','Financial Services'),
    ('PNB','Punjab National Bank','Financial Services'),
    ('BANKBARODA','Bank of Baroda','Financial Services'),
    ('UNIONBANK','Union Bank of India','Financial Services'),
    ('FEDERALBNK','Federal Bank Ltd','Financial Services'),
    ('IDFCFIRSTB','IDFC First Bank Ltd','Financial Services'),
    ('BANDHANBNK','Bandhan Bank Ltd','Financial Services'),
    ('RBLBANK','RBL Bank Ltd','Financial Services'),
    ('YESBANK','Yes Bank Ltd','Financial Services'),
    ('TORNTPHARM','Torrent Pharmaceuticals Ltd','Healthcare'),
    ('LUPIN','Lupin Ltd','Healthcare'),
    ('AUROPHARMA','Aurobindo Pharma Ltd','Healthcare'),
    ('ALKEM','Alkem Laboratories Ltd','Healthcare'),
    ('BIOCON','Biocon Ltd','Healthcare'),
    ('MPHASIS','MphasiS Ltd','Information Technology'),
    ('LTIM','LTIMindtree Ltd','Information Technology'),
    ('COFORGE','Coforge Ltd','Information Technology'),
    ('PERSISTENT','Persistent Systems Ltd','Information Technology'),
    ('OFSS','Oracle Financial Services Software Ltd','Information Technology'),
    ('KPITTECH','KPIT Technologies Ltd','Information Technology'),
    ('TATAELXSI','Tata Elxsi Ltd','Information Technology'),
    ('HINDPETRO','Hindustan Petroleum Corporation Ltd','Oil Gas & Energy'),
    ('IOC','Indian Oil Corporation Ltd','Oil Gas & Energy'),
    ('VEDL','Vedanta Ltd','Metals & Mining'),
    ('NMDC','NMDC Ltd','Metals & Mining'),
    ('SAIL','Steel Authority of India Ltd','Metals & Mining'),
    ('HINDZINC','Hindustan Zinc Ltd','Metals & Mining'),
    ('NATIONALUM','National Aluminium Company Ltd','Metals & Mining'),
    ('TATAPOWER','Tata Power Company Ltd','Power'),
    ('CESC','CESC Ltd','Power'),
    ('TORNTPOWER','Torrent Power Ltd','Power'),
    ('JSWENERGY','JSW Energy Ltd','Power'),
    ('NHPC','NHPC Ltd','Power'),
    ('SJVN','SJVN Ltd','Power'),
    ('SUZLON','Suzlon Energy Ltd','Power'),
    ('BOSCHLTD','Bosch Ltd','Automobile'),
    ('BALKRISIND','Balkrishna Industries Ltd','Automobile'),
    ('MOTHERSON','Samvardhana Motherson International Ltd','Automobile'),
    ('EXIDEIND','Exide Industries Ltd','Automobile'),
    ('BAJAJ-AUTO','Bajaj Auto Ltd','Automobile'),
    ('TVSMOTOR','TVS Motor Company Ltd','Automobile'),
    ('ASHOKLEY','Ashok Leyland Ltd','Automobile'),
    ('APOLLOTYRE','Apollo Tyres Ltd','Automobile'),
    ('MRF','MRF Ltd','Automobile'),
    ('GODREJCP','Godrej Consumer Products Ltd','FMCG'),
    ('DABUR','Dabur India Ltd','FMCG'),
    ('MARICO','Marico Ltd','FMCG'),
    ('COLPAL','Colgate-Palmolive (India) Ltd','FMCG'),
    ('EMAMILTD','Emami Ltd','FMCG'),
    ('PIDILITIND','Pidilite Industries Ltd','Chemicals'),
    ('UPL','UPL Ltd','Chemicals'),
    ('DEEPAKNITR','Deepak Nitrite Ltd','Chemicals'),
    ('SRF','SRF Ltd','Chemicals'),
    ('NAVINFLUOR','Navin Fluorine International Ltd','Chemicals'),
    ('FLUOROCHEM','Gujarat Fluorochemicals Ltd','Chemicals'),
    ('AARTIIND','Aarti Industries Ltd','Chemicals'),
    ('TATACHEM','Tata Chemicals Ltd','Chemicals'),
    ('COROMANDEL','Coromandel International Ltd','Chemicals'),
    ('CLEAN','Clean Science and Technology Ltd','Chemicals'),
    ('FINEORG','Fine Organic Industries Ltd','Chemicals'),
    ('GALAXYSURF','Galaxy Surfactants Ltd','Chemicals'),
    ('ALKYLAMINE','Alkyl Amines Chemicals Ltd','Chemicals'),
    ('BALAMINES','Balaji Amines Ltd','Chemicals'),
    ('GNFC','Gujarat Narmada Valley Fertilizers and Chemicals Ltd','Chemicals'),
    ('GSFC','Gujarat State Fertilizers & Chemicals Ltd','Chemicals'),
    ('CHAMBLF','Chambal Fertilizers and Chemicals Ltd','Chemicals'),
    ('PCBL','PCBL Ltd','Chemicals'),
    ('MUTHOOTFIN','Muthoot Finance Ltd','Financial Services'),
    ('CHOLAFIN','Cholamandalam Investment and Finance Company Ltd','Financial Services'),
    ('ANGELONE','Angel One Ltd','Financial Services'),
    ('ICICIPRULI','ICICI Prudential Life Insurance Company Ltd','Financial Services'),
    ('HDFCLIFE','HDFC Life Insurance Company Ltd','Financial Services'),
    ('SBILIFE','SBI Life Insurance Company Ltd','Financial Services'),
    ('LICI','Life Insurance Corporation of India','Financial Services'),
    ('PFC','Power Finance Corporation Ltd','Financial Services'),
    ('REC','REC Ltd','Financial Services'),
    ('IREDA','Indian Renewable Energy Development Agency Ltd','Financial Services'),
    ('CRISIL','CRISIL Ltd','Financial Services'),
    ('CDSL','Central Depository Services Ltd','Financial Services'),
    ('BSE','BSE Ltd','Financial Services'),
    ('IEX','Indian Energy Exchange Ltd','Financial Services'),
    ('POLICYBZR','PB Fintech Ltd','Financial Services'),
    ('PIRAMALENT','Piramal Enterprises Ltd','Financial Services'),
    ('LICHSGFIN','LIC Housing Finance Ltd','Financial Services'),
    ('PNBHOUSING','PNB Housing Finance Ltd','Financial Services'),
    ('MOTILALOFS','Motilal Oswal Financial Services Ltd','Financial Services'),
    ('AAVAS','Aavas Financiers Ltd','Financial Services'),
    ('HOMEFIRST','Home First Finance Company India Ltd','Financial Services'),
    ('CANFINHOME','Can Fin Homes Ltd','Financial Services'),
    ('EDELWEISS','Edelweiss Financial Services Ltd','Financial Services'),
    ('MANAPPURAM','Manappuram Finance Ltd','Financial Services'),
    ('L&TFH','L&T Finance Holdings Ltd','Financial Services'),
    ('SBICARD','SBI Cards and Payment Services Ltd','Financial Services'),
    ('HDFCAMC','HDFC Asset Management Company Ltd','Financial Services'),
    ('CAMS','Computer Age Management Services Ltd','Financial Services'),
    ('360ONE','360 ONE WAM Ltd','Financial Services'),
    ('NUVAMA','Nuvama Wealth Management Ltd','Financial Services'),
    ('ISEC','ICICI Securities Ltd','Financial Services'),
    ('IDBI','IDBI Bank Ltd','Financial Services'),
    ('MAHABANK','Bank of Maharashtra','Financial Services'),
    ('DLF','DLF Ltd','Real Estate'),
    ('GODREJPROP','Godrej Properties Ltd','Real Estate'),
    ('PRESTIGE','Prestige Estates Projects Ltd','Real Estate'),
    ('OBEROIRLTY','Oberoi Realty Ltd','Real Estate'),
    ('LODHA','Macrotech Developers Ltd','Real Estate'),
    ('BRIGADE','Brigade Enterprises Ltd','Real Estate'),
    ('SOBHA','Sobha Ltd','Real Estate'),
    ('ACC','ACC Ltd','Infrastructure & Real Estate'),
    ('AMBUJACEMENT','Ambuja Cements Ltd','Infrastructure & Real Estate'),
    ('RAMCOCEM','The Ramco Cements Ltd','Infrastructure & Real Estate'),
    ('DALBHARAT','Dalmia Bharat Ltd','Infrastructure & Real Estate'),
    ('JKCEMENT','JK Cement Ltd','Infrastructure & Real Estate'),
    ('GMRINFRA','GMR Airports Infrastructure Ltd','Infrastructure & Real Estate'),
    ('NUVOCO','Nuvoco Vistas Corporation Ltd','Infrastructure & Real Estate'),
    ('SUNTV','Sun TV Network Ltd','Media & Entertainment'),
    ('ZEEL','Zee Entertainment Enterprises Ltd','Media & Entertainment'),
    ('PVR','PVR Inox Ltd','Media & Entertainment'),
    ('NETWORK18','Network18 Media & Investments Ltd','Media & Entertainment'),
    ('INDIGO','InterGlobe Aviation Ltd','Transportation & Logistics'),
    ('CONCOR','Container Corporation of India Ltd','Transportation & Logistics'),
    ('BLUEDART','Blue Dart Express Ltd','Transportation & Logistics'),
    ('GPPL','Gujarat Pipavav Port Ltd','Transportation & Logistics'),
    ('INDHOTEL','The Indian Hotels Company Ltd','Consumer Services'),
    ('LEMON','Lemon Tree Hotels Ltd','Consumer Services'),
    ('EIH','EIH Ltd','Consumer Services'),
    ('CHALET','Chalet Hotels Ltd','Consumer Services'),
    ('MHRIL','Mahindra Holidays & Resorts India Ltd','Consumer Services'),
    ('JUBLFOOD','Jubilant Foodworks Ltd','Consumer Services'),
    ('WESTLIFE','Westlife Foodworld Ltd','Consumer Services'),
    ('DEVYANI','Devyani International Ltd','Consumer Services'),
    ('NAUKRI','Info Edge (India) Ltd','Consumer Services'),
    ('INDIAMART','Indiamart Intermesh Ltd','Consumer Services'),
    ('JUSTDIAL','Just Dial Ltd','Consumer Services'),
    ('DMART','Avenue Supermarts Ltd','Retail'),
    ('TRENT','Trent Ltd','Retail'),
    ('SHOPERSTOP','Shoppers Stop Ltd','Retail'),
    ('VMART','V-Mart Retail Ltd','Retail'),
    ('NYKAA','FSN E-Commerce Ventures Ltd','Retail'),
    ('PAYTM','One 97 Communications Ltd','Financial Services'),
    ('HAVELLS','Havells India Ltd','Consumer Durables'),
    ('VOLTAS','Voltas Ltd','Consumer Durables'),
    ('CROMPTON','Crompton Greaves Consumer Electricals Ltd','Consumer Durables'),
    ('POLYCAB','Polycab India Ltd','Capital Goods'),
    ('DIXON','Dixon Technologies (India) Ltd','Consumer Durables'),
    ('AMBER','Amber Enterprises India Ltd','Consumer Durables'),
    ('BATA','Bata India Ltd','Consumer Durables'),
    ('KALYANKJIL','Kalyan Jewellers India Ltd','Consumer Durables'),
    ('TITAN','Titan Company Ltd','Consumer Durables'),
    ('DOMS','DOMS Industries Ltd','Consumer Durables'),
    ('RELAXO','Relaxo Footwears Ltd','Consumer Durables'),
    ('BHEL','Bharat Heavy Electricals Ltd','Capital Goods'),
    ('ABB','ABB India Ltd','Capital Goods'),
    ('SIEMENS','Siemens Ltd','Capital Goods'),
    ('CUMMINSIND','Cummins India Ltd','Capital Goods'),
    ('THERMAX','Thermax Ltd','Capital Goods'),
    ('KEI','KEI Industries Ltd','Capital Goods'),
    ('SOLARINDS','Solar Industries India Ltd','Capital Goods'),
    ('ESCORTS','Escorts Kubota Ltd','Capital Goods'),
    ('BEML','BEML Ltd','Capital Goods'),
    ('NCC','NCC Ltd','Capital Goods'),
    ('KPIL','Kalpataru Projects International Ltd','Capital Goods'),
    ('HAL','Hindustan Aeronautics Ltd','Capital Goods'),
    ('BEL','Bharat Electronics Ltd','Capital Goods'),
    ('BDL','Bharat Dynamics Ltd','Capital Goods'),
    ('MIDHANI','Mishra Dhatu Nigam Ltd','Capital Goods'),
    ('MAZDOCK','Mazagon Dock Shipbuilders Ltd','Capital Goods'),
    ('COCHINSHIP','Cochin Shipyard Ltd','Capital Goods'),
    ('GRSE','Garden Reach Shipbuilders & Engineers Ltd','Capital Goods'),
    ('KAYNES','Kaynes Technology India Ltd','Capital Goods'),
    ('METROPOLIS','Metropolis Healthcare Ltd','Healthcare'),
    ('LALPATHLAB','Dr Lal PathLabs Ltd','Healthcare'),
    ('IPCALAB','IPCA Laboratories Ltd','Healthcare'),
    ('GLENMARK','Glenmark Pharmaceuticals Ltd','Healthcare'),
    ('AJANTPHARM','Ajanta Pharma Ltd','Healthcare'),
    ('GRANULES','Granules India Ltd','Healthcare'),
    ('MEDANTA','Global Health Ltd','Healthcare'),
    ('KIMS','Krishna Institute of Medical Sciences Ltd','Healthcare'),
    ('RAINBOW','Rainbow Childrens Medicare Ltd','Healthcare'),
    ('THYROCARE','Thyrocare Technologies Ltd','Healthcare'),
    ('PFIZER','Pfizer Ltd','Healthcare'),
    ('ABBOTINDIA','Abbott India Ltd','Healthcare'),
    ('WOCKPHARMA','Wockhardt Ltd','Healthcare'),
    ('TATACOMM','Tata Communications Ltd','Telecom'),
    ('HFCL','HFCL Ltd','Telecom'),
    ('RAILTEL','RailTel Corporation of India Ltd','Telecom'),
    ('TEJASNET','Tejas Networks Ltd','Telecom'),
    ('STLTECH','Sterlite Technologies Ltd','Telecom'),
    ('MTNL','Mahanagar Telephone Nigam Ltd','Telecom'),
    ('LTTS','L&T Technology Services Ltd','Information Technology'),
    ('TANLA','Tanla Platforms Ltd','Information Technology'),
    ('ROUTE','Route Mobile Ltd','Information Technology'),
    ('INTELLECT','Intellect Design Arena Ltd','Information Technology'),
    ('MASTEK','Mastek Ltd','Information Technology'),
    ('ECLERX','eClerx Services Ltd','Information Technology'),
    ('NEWGEN','Newgen Software Technologies Ltd','Information Technology'),
    ('RATEGAIN','RateGain Travel Technologies Ltd','Information Technology'),
    ('AFFLE','Affle (India) Ltd','Information Technology'),
    ('NAZARA','Nazara Technologies Ltd','Information Technology'),
    ('LATENTVIEW','Latent View Analytics Ltd','Information Technology'),
    ('MAPMYINDIA','CE Info Systems Ltd','Information Technology'),
    ('TATATECH','Tata Technologies Ltd','Information Technology'),
    ('CYIENT','Cyient Ltd','Information Technology'),
    ('HINDPETRO','Hindustan Petroleum Corporation Ltd','Oil Gas & Energy'),
    ('IOC','Indian Oil Corporation Ltd','Oil Gas & Energy'),
    ('PETRONET','Petronet LNG Ltd','Oil Gas & Energy'),
    ('IGL','Indraprastha Gas Ltd','Oil Gas & Energy'),
    ('MGL','Mahanagar Gas Ltd','Oil Gas & Energy'),
    ('GUJGASLTD','Gujarat Gas Ltd','Oil Gas & Energy'),
    ('CASTROLIND','Castrol India Ltd','Oil Gas & Energy'),
    ('MRPL','Mangalore Refinery and Petrochemicals Ltd','Oil Gas & Energy'),
    ('APLAPOLLO','APL Apollo Tubes Ltd','Metals & Mining'),
    ('RATNAMANI','Ratnamani Metals & Tubes Ltd','Metals & Mining'),
    ('WELCORP','Welspun Corp Ltd','Metals & Mining'),
    ('HINDCOPPER','Hindustan Copper Ltd','Metals & Mining'),
    ('MOIL','MOIL Ltd','Metals & Mining'),
    ('SHYAMMETL','Shyam Metalics and Energy Ltd','Metals & Mining'),
    ('KIOCL','KIOCL Ltd','Metals & Mining'),
    ('INOXGREEN','INOX Green Energy Services Ltd','Power'),
    ('BIKAJI','Bikaji Foods International Ltd','FMCG'),
    ('JYOTHYLAB','Jyothy Labs Ltd','FMCG'),
    ('SPICEJET','SpiceJet Ltd','Transportation & Logistics'),
    ('TVSSCS','TVS Supply Chain Solutions Ltd','Transportation & Logistics'),
    ('GICRE','General Insurance Corporation of India','Financial Services'),
    ('NIACL','The New India Assurance Company Ltd','Financial Services'),
    ('STARHEALTH','Star Health and Allied Insurance Company Ltd','Financial Services'),
    ('NIPPONLIFE','Nippon India Asset Management Ltd','Financial Services'),
    ('UTIAMC','UTI Asset Management Company Ltd','Financial Services'),
    ('ABSLAMC','Aditya Birla Sun Life AMC Ltd','Financial Services'),
    ('IIFL','IIFL Finance Ltd','Financial Services'),
    ('5PAISA','5Paisa Capital Ltd','Financial Services'),
    ('NSDL','National Securities Depository Ltd','Financial Services'),
    ('CARTRADE','CarTrade Tech Ltd','Consumer Services'),
    ('SAPPHIRE','Sapphire Foods India Ltd','Consumer Services'),
    ('CAMPUS','Campus Activewear Ltd','Consumer Durables'),
    ('BLUESTARCO','Blue Star Ltd','Consumer Durables'),
    ('WHIRLPOOL','Whirlpool of India Ltd','Consumer Durables'),
    ('VAIBHAVGBL','Vaibhav Global Ltd','Retail'),
    ('GODREJIND','Godrej Industries Ltd','FMCG'),
    ('BAJAJHLDNG','Bajaj Holdings & Investment Ltd','Financial Services'),
    ('TVSMOTOR','TVS Motor Company Ltd','Automobile'),
    ('MFSL','Max Financial Services Ltd','Financial Services'),
    ('CEATLTD','CEAT Ltd','Automobile'),
    ('AMARAJABAT','Amara Raja Energy & Mobility Ltd','Automobile'),
    ('BOSCHLTD','Bosch Ltd','Automobile'),
    ('BALKRISIND','Balkrishna Industries Ltd','Automobile'),
    ('SOLARA','Solara Active Pharma Sciences Ltd','Healthcare'),
    ('AARTIDRUGS','Aarti Drugs Ltd','Chemicals'),
    ('SUDARSCHEM','Sudarshan Chemical Industries Ltd','Chemicals'),
    ('BLS','BLS International Services Ltd','Consumer Services'),
    ('PARAS','Paras Defence and Space Technologies Ltd','Capital Goods'),
    ('NAUKRI','Info Edge (India) Ltd','Consumer Services'),
]


def main():
    print('Starting NSE + BSE company seed...')
    print('')

    conn = psycopg2.connect(DATABASE_URL, sslmode='require')
    conn.autocommit = False
    cur = conn.cursor()
    print('Connected to PostgreSQL')
    print('')

    all_companies = {}

    # 1. NSE Equity List (EQUITY_L.csv - no auth needed)
    print('Fetching NSE equity list (EQUITY_L.csv)...')
    try:
        csv_text = fetch_url(
            'https://archives.nseindia.com/content/equities/EQUITY_L.csv',
            headers={'Referer': 'https://www.nseindia.com/'}
        )
        rows = parse_csv_text(csv_text)
        print(f'   Got {len(rows)} NSE rows')
        for row in rows:
            symbol = (row.get('SYMBOL') or row.get('symbol') or '').strip().upper()
            name = (row.get('NAME OF COMPANY') or row.get('name_of_company') or row.get('Company Name') or symbol).strip()
            series = (row.get('SERIES') or row.get('series') or 'EQ').strip().upper()
            industry = (row.get('INDUSTRY') or row.get('industry') or '').strip()
            if not symbol or series in ('GB', 'GS', 'TB'):
                continue
            all_companies[symbol] = {
                'symbol': symbol,
                'name': name or symbol,
                'sector': map_sector(industry),
                'industry': industry or None,
                'exchange': 'NSE',
            }
        print(f'   OK - {len(all_companies)} unique NSE companies loaded')
        print('')
    except Exception as e:
        print(f'   WARNING: NSE EQUITY_L.csv failed: {e}')

    # 2. NSE FnO list
    print('Fetching NSE FnO symbols...')
    try:
        fno_text = fetch_url(
            'https://archives.nseindia.com/content/fo/fo_mktlots.csv',
            headers={'Referer': 'https://www.nseindia.com/'}
        )
        fno_rows = parse_csv_text(fno_text)
        fno_added = 0
        for row in fno_rows:
            symbol = (row.get('SYMBOL') or row.get('symbol') or row.get('Underlying') or '').strip().upper()
            if not symbol or symbol in all_companies:
                continue
            name = (row.get('NAME') or row.get('name') or symbol).strip()
            all_companies[symbol] = {
                'symbol': symbol, 'name': name, 'sector': None,
                'industry': None, 'exchange': 'NSE',
            }
            fno_added += 1
        print(f'   OK - {fno_added} additional FnO symbols added')
        print('')
    except Exception as e:
        print(f'   WARNING: FnO CSV failed: {e}')

    # 3. BSE Scrip API
    print('Fetching BSE scrip list...')
    try:
        bse_text = fetch_url(
            'https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active',
            headers={
                'Origin': 'https://www.bseindia.com',
                'Referer': 'https://www.bseindia.com/',
            }
        )
        bse_data = json.loads(bse_text)
        if isinstance(bse_data, dict):
            bse_data = bse_data.get('Table') or bse_data.get('data') or []
        print(f'   Got {len(bse_data)} BSE rows')
        bse_added = 0
        for row in bse_data:
            nse_sym = (row.get('NSESYMBOL') or row.get('NSESymbol') or row.get('NseSymbol') or '').strip().upper()
            name = (row.get('SCRIP_NAME') or row.get('ScripName') or row.get('COMPANY') or '').strip()
            industry = (row.get('INDUSTRY') or row.get('Industryname') or '').strip()
            if nse_sym and nse_sym not in all_companies and name:
                all_companies[nse_sym] = {
                    'symbol': nse_sym, 'name': name,
                    'sector': map_sector(industry), 'industry': industry or None,
                    'exchange': 'NSE',
                }
                bse_added += 1
        print(f'   OK - {bse_added} additional BSE-only companies added')
        print('')
    except Exception as e:
        print(f'   WARNING: BSE API failed: {e}')

    # 4. Core hardcoded baseline
    hardcoded_added = 0
    for symbol, name, sector in CORE_UNIVERSE:
        if symbol not in all_companies:
            all_companies[symbol] = {
                'symbol': symbol, 'name': name, 'sector': sector,
                'industry': None, 'exchange': 'NSE',
            }
            hardcoded_added += 1
    print(f'Hardcoded baseline: {hardcoded_added} additional core stocks added')
    print('')

    # 5. Upsert into PostgreSQL
    companies = list(all_companies.values())
    print(f'Total companies to seed: {len(companies)}')
    print('Inserting into database in batches of 200...')
    print('')

    BATCH_SIZE = 200
    total_inserted = 0

    for i in range(0, len(companies), BATCH_SIZE):
        batch = companies[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(companies) + BATCH_SIZE - 1) // BATCH_SIZE

        values_list = []
        params = []
        for c in batch:
            values_list.append('(%s, %s, %s, %s, %s, true, NOW())')
            params.extend([
                c['symbol'],
                (c['name'] or c['symbol'])[:500],
                c.get('sector'),
                c.get('industry'),
                c.get('exchange') or 'NSE',
            ])

        sql = (
            'INSERT INTO companies (symbol, name, sector, industry, exchange, is_active, updated_at) '
            'VALUES ' + ','.join(values_list) + ' '
            'ON CONFLICT (symbol) DO UPDATE SET '
            '  name = EXCLUDED.name, '
            '  sector = COALESCE(EXCLUDED.sector, companies.sector), '
            '  industry = COALESCE(EXCLUDED.industry, companies.industry), '
            '  exchange = EXCLUDED.exchange, '
            '  is_active = true, '
            '  updated_at = NOW()'
        )

        try:
            cur.execute(sql, params)
            conn.commit()
            print(f'   Batch {batch_num}/{total_batches}: {len(batch)} rows inserted/updated')
            total_inserted += len(batch)
        except Exception as e:
            conn.rollback()
            print(f'   ERROR in batch {batch_num}: {e}')

    # 6. Final stats
    cur.execute('SELECT COUNT(*) FROM companies')
    total = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM companies WHERE is_active = true')
    active = cur.fetchone()[0]

    print('')
    print('=== SEEDING COMPLETE ===')
    print(f'Total rows in companies: {total}')
    print(f'Active companies: {active}')

    cur.execute('SELECT symbol, name, sector, exchange FROM companies ORDER BY symbol LIMIT 15')
    sample = cur.fetchall()
    print('')
    print('Sample companies:')
    for r in sample:
        sym = str(r[0]).ljust(20)
        nm = str(r[1] or '')[:40].ljust(42)
        ex = str(r[3] or 'NSE')
        sec = str(r[2] or '')
        print(f'   {sym} {nm} [{ex}] {sec}')

    cur.close()
    conn.close()
    print('')
    print('Done! All NSE + BSE equities are now in the database.')
    print('')


if __name__ == '__main__':
    main()
