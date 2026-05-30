import { SemanticSearchDashboard } from '@/components/semantic-search/SemanticSearchDashboard';
import { Target } from 'lucide-react';

export default function SemanticSearchPage() {
  return (
    <div className="space-y-6 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Target className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Semantic Financial Search</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Institutional-grade vector retrieval grounded strictly in validated source documents
              </p>
            </div>
          </div>
        </div>
      </div>

      <SemanticSearchDashboard />
    </div>
  );
}
