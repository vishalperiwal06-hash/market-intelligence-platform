import { PortfolioDashboard } from '@/components/portfolio/PortfolioDashboard';
import { Briefcase, ShieldCheck } from 'lucide-react';

export default function PortfolioPage() {
  return (
    <div className="space-y-6 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Briefcase className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Institutional Portfolio Intelligence</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Autonomous Watchlists & Cross-Domain Event Correlation Engine
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-blue-900/50 rounded-md text-xs font-medium text-blue-400">
            <ShieldCheck className="h-4 w-4" />
            Local-First Prioritization Active
          </div>
        </div>
      </div>

      <PortfolioDashboard />
    </div>
  );
}
