/**
 * Institutional-grade official company logo resolver.
 * Maps Indian NSE/BSE listed equities to their official corporate domains
 * and resolves high-quality logos using the Clearbit / Brandfetch CDNs.
 */

// Calibrated mapping for top Indian public companies to their official domains
const DOMAIN_MAP: Record<string, string> = {
  // Nifty 50 & Major Corporates
  RELIANCE: 'ril.com',
  TCS: 'tcs.com',
  INFY: 'infosys.com',
  HDFCBANK: 'hdfcbank.com',
  ICICIBANK: 'icicibank.com',
  SBIN: 'sbi.co.in',
  AXISBANK: 'axisbank.com',
  KOTAKBANK: 'kotak.com',
  LT: 'larsentoubro.com',
  ITC: 'itcportal.com',
  HINDUNILVR: 'hul.co.in',
  BHARTIARTL: 'airtel.in',
  BAJFINANCE: 'bajajfinserv.in',
  BAJAJFINSV: 'bajajfinserv.in',
  TATAMOTORS: 'tatamotors.com',
  TATASTEEL: 'tatasteel.com',
  WIPRO: 'wipro.com',
  HCLTECH: 'hcltech.com',
  NTPC: 'ntpc.co.in',
  POWERGRID: 'powergrid.in',
  ADANIENT: 'adani.com',
  MARUTI: 'marutisuzuki.com',
  SUNPHARMA: 'sunpharma.com',
  ONGC: 'ongcindia.com',
  COALINDIA: 'coalindia.in',
  JIOFIN: 'jiofinancialservices.com',
  LTIM: 'ltimindtree.com',
  ULTRACEMCO: 'ultratechcement.com',
  GRASIM: 'grasim.com',
  JSWSTEEL: 'jswsteel.in',
  ASIANPAINT: 'asianpaints.com',
  TITAN: 'titancompany.in',
  ADANIPORTS: 'adaniports.com',
  TECHM: 'techmahindra.com',
  EICHERMOT: 'eicher.in',
  INDUSINDBK: 'indusind.com',
  HINDZINC: 'hzlindia.com',
  HINDALCO: 'hindalco.com',
  NESTLEIND: 'nestle.in',
  DABUR: 'dabur.com',
  BRITANNIA: 'britannia.co.in',
  TATACONSUM: 'tataconsumerproducts.com',
  MUTHOOTFIN: 'muthootfinance.com',
  SHRIRAMFIN: 'shriramfinance.in',
  DLF: 'dlf.in',
  IRCTC: 'irctc.co.in',
  HAL: 'hal-india.co.in',
  BEL: 'bel-india.in',
  RVNL: 'rvnl.org',
  PFC: 'pfcindia.com',
  RECLTD: 'recindia.nic.in',
  SUZLON: 'suzlon.com',
  ZOMATO: 'zomato.com',
  NYKAA: 'nykaa.com',
  PAYTM: 'paytm.com',
  MTAR: 'mtar.in',
  MTARTECH: 'mtar.in',
  JEENA: 'jeenasikho.co.in', // Jeena Sikho Lifecare
  BPCL: 'bharatpetroleum.in',
  IOC: 'iocl.com',
  HPCL: 'hindustanpetroleum.com',
  GAIL: 'gailonline.com',
  OLECTRA: 'olectra.com',
  DIXON: 'dixoninfo.com',
  MAZDOCK: 'mazagondock.in',
  COCHINSHIP: 'cochinshipyard.in',
  GRSE: 'grse.in',
  BDL: 'bdl-india.in',
  PATELENG: 'pateleng.com',
  TATACHEM: 'tata-chemicals.com',
  DEEPAKCTR: 'deepaknitrite.com',
  AARTIIND: 'aarti-industries.com',
  BORORENEW: 'borosilrenewables.com',
  KPI: 'kpigreenenergy.com',
  SJVN: 'sjvn.nic.in',
  NHPC: 'nhpcindia.com',
  IRFC: 'irfc.co.in',
  KAYNES: 'kaynestechnology.co.in',
  SYRMA: 'syrmasgs.com',
  AVALON: 'avalontec.com',
  CIPLA: 'cipla.com',
  DRREDDY: 'drreddys.com',
  DIVISLAB: 'divislabs.com',
  APOLLOHOSP: 'apollohospitals.com',
  LUPIN: 'lupin.com',
  AUROPHARMA: 'aurobindo.com',
  BIOCON: 'biocon.com',
  GLAND: 'glandpharma.com',
  ZYDUSLIFE: 'zyduslife.com',
  LAURUSLABS: 'lauruslabs.com',
  IPCALAB: 'ipca.com',
  GLAXO: 'gsk-india.com',
  ALKEM: 'alkemlabs.com',
  ABBOTINDIA: 'abbott.co.in',
  TATAPOWER: 'tatapower.com',
  ADANIGREEN: 'adanigreenenergy.com',
  JSWENERGY: 'jsw.in',
  GENUSPOWER: 'genuspower.com',
  GIPCL: 'gipcl.com',
  BEML: 'bemlindia.in',
  ASTRAMICRO: 'astramicro.com',
  DATAPATTS: 'datapatterndec.com',
  ZEN: 'zentechnologies.com',
  RAILTEL: 'railtelindia.com',
  TEXRAIL: 'texmaco.in',
  TITAGARH: 'titagarh.in',
  RITES: 'rites.com',
  KEC: 'kecrpg.com',
  ENGINERSIN: 'engineersindia.com',
  COFORGE: 'coforge.com',
  KPITTECH: 'kpit.com',
  TATAELXSI: 'tataelxsi.com',
  CYIENT: 'cyient.com',
  ZENSARTECH: 'zensar.com',
  SONATSOFTW: 'sonata-software.com',
  INTELLECT: 'intellectdesign.com',
  MAPMYINDIA: 'mapmyindia.com',
  VBL: 'varunpepsico.com',
  BALRAMCHIN: 'chini.com',
  KRBL: 'krblrice.com',
  FINEORG: 'fineorganics.com',
  GUJALKALI: 'gacl.com',
  VALIANTORG: 'valiantorganics.com',
  FLUOROCHEM: 'gfl.co.in',
  CLEAN: 'cleanscience.co.in',
  ATUL: 'atul.co.in',
  VINATIORG: 'vinatiorganics.com',
};

export function guessDomain(symbol: string, companyName?: string | null): string {
  let sym = symbol.toUpperCase().trim();
  // Strip exchange suffixes from symbol
  sym = sym.replace(/\.(NS|BO)$/, '').replace(/-(EQ|BE|BL|BZ|N\d)$/, '').trim();
  
  if (DOMAIN_MAP[sym]) {
    return DOMAIN_MAP[sym];
  }

  if (!companyName) {
    return `${sym.toLowerCase()}.com`;
  }

  let name = companyName.toLowerCase().trim();
  
  // Remove trailing and nested corporate types
  name = name
    .replace(/\b(ltd|limited|corp|corporation|inc|incorporated|co|company|ind|india|industries|technologies|tech|services|capital|finance|holdings|group|systems|infrastructure|infra|power|pharma|pharmaceuticals|chemicals|metals|steel|motors|banks|banking|insurance)\b/g, '')
    .replace(/[^a-z0-9]/g, '') // strip special chars and spaces
    .trim();

  if (name.length < 3) {
    return `${sym.toLowerCase()}.com`;
  }

  // Common guessing extensions for Indian companies
  return `${name}.com`;
}

/**
 * Returns the high-resolution official logo URL for a company symbol.
 */
export function getCompanyLogoUrl(symbol: string, companyName?: string | null): string {
  const domain = guessDomain(symbol, companyName);
  return `https://logo.clearbit.com/${domain}`;
}
