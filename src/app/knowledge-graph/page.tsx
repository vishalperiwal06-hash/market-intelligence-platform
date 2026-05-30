'use client';

import { useState } from 'react';
import { ThematicHeatmap } from '@/components/knowledge-graph/ThematicHeatmap';
import { CompanyRelationshipMap } from '@/components/knowledge-graph/CompanyRelationshipMap';
import { ManagementGuidanceTimeline } from '@/components/knowledge-graph/ManagementGuidanceTimeline';
import { CompanyEventTimeline } from '@/components/knowledge-graph/CompanyEventTimeline';
import { SectorIntelligencePanel } from '@/components/knowledge-graph/SectorIntelligencePanel';
import { Search, Network } from 'lucide-react';

export default function KnowledgeGraphPage() {
  const [symbol, setSymbol] = useState('RELIANCE');
  const [inputValue, setInputValue] = useState('RELIANCE');

  const handleSearch = () => {
    const val = inputValue.trim().toUpperCase();
    if (val) setSymbol(val);
  };

  return (
    <div className="space-y-6 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <Network className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Knowledge Graph</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Institutional semantic memory — all relationships derived from verified filings
              </p>
            </div>
          </div>
        </div>

        {/* Symbol Search */}
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              value={inputValue}
              onChange={e => setInputValue(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Symbol (e.g. TCS)"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-2 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-shadow font-mono"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 text-sm font-semibold bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 rounded-md transition-colors"
          >
            Analyze
          </button>
        </div>
      </div>

      {/* Row 1: Thematic Heatmap (full width) */}
      <ThematicHeatmap />

      {/* Row 2: Company-specific intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Sector themes + Relationship Map */}
        <div className="space-y-5">
          <SectorIntelligencePanel symbol={symbol} />
          <CompanyRelationshipMap symbol={symbol} />
        </div>

        {/* Center: Management Guidance Timeline */}
        <div>
          <ManagementGuidanceTimeline symbol={symbol} />
        </div>

        {/* Right: Company Event Timeline */}
        <div>
          <CompanyEventTimeline symbol={symbol} />
        </div>
      </div>
    </div>
  );
}
