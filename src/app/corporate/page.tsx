import { ExtractedFinancialsTable } from '@/components/market/ExtractedFinancialsTable';
import { ManagementCommentaryPanel } from '@/components/market/ManagementCommentaryPanel';
import { CorporateFilingsFeed } from '@/components/market/CorporateFilingsFeed';
import { MarketNewsFeed } from '@/components/market/MarketNewsFeed';
import { ParsingDiagnosticsWidget } from '@/components/market/ParsingDiagnosticsWidget';
import { Search } from 'lucide-react';

export const metadata = {
  title: 'Corporate Intelligence — AI Bazaar',
  description: 'Institutional-grade corporate filings, extracted financials, and management commentary.',
};

export default function CorporatePage() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Corporate Intelligence</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Extracted financials, management commentary, and live filings from NSE/BSE.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-zinc-500" />
          </div>
          <input
            type="text"
            placeholder="Search by symbol (e.g. RELIANCE)..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
          />
        </div>
      </div>

      {/* Row 1: Extracted Financials Table (full width) */}
      <ExtractedFinancialsTable />

      {/* Row 2: Commentary + Filings + News */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <ManagementCommentaryPanel />
        </div>
        <div className="lg:col-span-1">
          <CorporateFilingsFeed />
        </div>
        <div className="lg:col-span-1 flex flex-col gap-6">
          <MarketNewsFeed />
          <ParsingDiagnosticsWidget />
        </div>
      </div>
    </div>
  );
}
