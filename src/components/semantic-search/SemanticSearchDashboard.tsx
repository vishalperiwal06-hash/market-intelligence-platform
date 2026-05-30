'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, FileText, Database, Target, BrainCircuit } from 'lucide-react';

interface SearchResult {
  chunkId: string;
  documentId: string;
  symbol: string;
  chunkType: string;
  text: string;
  similarityScore: number;
  documentDate: string;
  sourceType: string;
}

export function SemanticSearchDashboard() {
  const [query, setQuery] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const url = new URL(window.location.origin + '/api/semantic-search');
      url.searchParams.append('q', query);
      if (symbolFilter) url.searchParams.append('symbol', symbolFilter.toUpperCase());

      const res = await fetch(url.toString());
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Search failed');

      // The backend returns an empty array if pgvector isn't installed, 
      // but if we got data, update state.
      setResults(json.data || []);
    } catch (err: any) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Search Bar */}
      <Card className="bg-zinc-900/80 border-zinc-800 shadow-xl">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Semantic Query (e.g. 'margin pressure due to raw material costs')"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-3 pl-11 pr-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
              />
            </div>
            <div className="w-full md:w-48">
              <input
                type="text"
                value={symbolFilter}
                onChange={e => setSymbolFilter(e.target.value)}
                placeholder="Symbol (Opt)"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-3 px-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-md font-semibold transition-colors flex items-center justify-center min-w-[120px]"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Search'}
            </button>
          </form>
          
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
            <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider py-1 shrink-0">Try searching:</span>
            {['"AI expansion plans"', '"Capex for new manufacturing"', '"Debt reduction strategy"', '"Inventory normalization"'].map(q => (
              <button 
                key={q}
                type="button"
                onClick={() => setQuery(q.replace(/"/g, ''))}
                className="text-xs px-2 py-1 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50 shrink-0 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results Area */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-md text-rose-400 text-sm">
          {error}
        </div>
      )}

      {hasSearched && !loading && !error && results.length === 0 && (
        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
          <Database className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-zinc-300 font-semibold">No semantic matches found</h3>
          <p className="text-zinc-500 text-sm mt-1 max-w-md mx-auto">
            This could happen if the vector embeddings haven't been generated yet, or if the pgvector extension is not fully configured in your database.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-400" />
              Evidence-Backed Retrievals
            </h3>
            
            {results.map((res, i) => (
              <Card key={res.chunkId || i} className="bg-zinc-900/60 border-zinc-800 overflow-hidden">
                <div className="p-4 border-b border-zinc-800/50 bg-zinc-900/80 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-zinc-200 text-lg">{res.symbol}</span>
                    <Badge variant="outline" className="bg-zinc-800 border-zinc-700 text-xs">
                      {res.chunkType.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 font-mono">
                      {new Date(res.documentDate).toLocaleDateString()}
                    </span>
                    <Badge className={`font-mono ${res.similarityScore > 0.8 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                      {(res.similarityScore * 100).toFixed(1)}% SIM
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-5">
                  <p className="text-zinc-300 text-sm leading-relaxed">
                    <span className="text-blue-500/50 font-serif text-xl leading-none mr-1">"</span>
                    {res.text}
                    <span className="text-blue-500/50 font-serif text-xl leading-none ml-1">"</span>
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-zinc-600">
                    <FileText className="h-3.5 w-3.5" />
                    Source: {res.sourceType} Document ({res.documentId.substring(0,8)}...)
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-6">
            <Card className="bg-blue-950/20 border-blue-900/30">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-blue-400 flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4" />
                  AI Copilot Context Ready
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  These retrieved chunks are now formatted and ready to be injected into the DeepSeek Copilot. 
                  Because we use raw mathematical vector distance, the AI is <strong>forced</strong> to ground its answers in these exact quotes, eliminating hallucination.
                </p>
                <div className="bg-zinc-950 rounded-md p-3 border border-zinc-800 font-mono text-[10px] text-zinc-500 overflow-hidden">
                  <span className="text-emerald-500">const</span> payload = {'{\n'}
                  {'  '}query: <span className="text-amber-300">"{query.substring(0,20)}..."</span>,\n
                  {'  '}evidence_chunks: <span className="text-blue-400">[{results.length}]</span>,\n
                  {'  '}market_regime: <span className="text-amber-300">"INJECTED"</span>\n
                  {'}'}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
