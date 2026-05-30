'use client';

import { MarketContextDashboard } from '@/components/market-context/MarketContextDashboard';
import { Compass } from 'lucide-react';

export default function MarketContextPage() {
  return (
    <div className="space-y-6 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Compass className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Market Context Engine</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Institutional-grade macro tracking: regimes, breadth, rotation, and liquidity
              </p>
            </div>
          </div>
        </div>
      </div>

      <MarketContextDashboard />
    </div>
  );
}
