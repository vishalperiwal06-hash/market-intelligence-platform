'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  GitBranch, Building2, User, Package, Cpu, MapPin,
  Wheat, Landmark, Hammer, ChevronDown, ChevronRight, ExternalLink,
} from 'lucide-react';

interface Node {
  id: string;
  name: string;
  type: string;
  linkedSymbol?: string | null;
}

interface Edge {
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  confidenceScore: number;
  evidenceCount: number;
  evidence: { sourceType: string; sourceExcerpt: string }[];
}

interface GraphData {
  centerEntity: Node;
  nodes: Node[];
  edges: Edge[];
}

const ENTITY_ICONS: Record<string, React.ElementType> = {
  COMPANY: Building2,
  PERSON: User,
  PRODUCT: Package,
  TECHNOLOGY: Cpu,
  GEOGRAPHY: MapPin,
  COMMODITY: Wheat,
  GOVERNMENT_PROGRAM: Landmark,
  CAPEX_PROJECT: Hammer,
  SECTOR: GitBranch,
  INDUSTRY: GitBranch,
};

const REL_COLORS: Record<string, string> = {
  SUPPLIER_OF: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  CUSTOMER_OF: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  PEER_OF: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  SUBSIDIARY_OF: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  PARENT_OF: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  EXPOSED_TO: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  COMPETES_WITH: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  COLLABORATES_WITH: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
  JOINT_VENTURE_WITH: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
};

interface Props {
  symbol: string;
}

export function CompanyRelationshipMap({ symbol }: Props) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEdgeId, setExpandedEdgeId] = useState<string | null>(null);

  useEffect(() => {
    const fetchGraph = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/knowledge-graph/graph?symbol=${symbol}`);
        if (res.ok) {
          const json = await res.json();
          setGraph(json.graph);
        }
      } catch { /* graceful */ }
      finally { setLoading(false); }
    };
    fetchGraph();
  }, [symbol]);

  if (loading) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-6 space-y-3 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-zinc-800/60 rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  if (!graph) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3 border-b border-zinc-800">
          <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-purple-400" />
            Relationship Graph — {symbol}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-center text-zinc-500 text-sm">
          No relationship data extracted yet for {symbol}.<br />
          <span className="text-zinc-600 text-xs">Relationships are derived from actual filing text only.</span>
        </CardContent>
      </Card>
    );
  }

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-purple-400" />
          Relationship Graph
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-zinc-950 border-zinc-700 text-zinc-300 font-mono">
            {symbol}
          </Badge>
          <span className="ml-auto text-[10px] text-zinc-500">
            {graph.edges.length} edges · {graph.nodes.length} nodes
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-1.5 max-h-96 overflow-y-auto">
        {graph.edges.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-sm">No relationships found yet.</div>
        ) : (
          graph.edges.map((edge, i) => {
            const fromNode = nodeMap.get(edge.fromEntityId);
            const toNode = nodeMap.get(edge.toEntityId);
            const edgeKey = `${edge.fromEntityId}:${edge.toEntityId}:${edge.relationshipType}`;
            const isExpanded = expandedEdgeId === edgeKey;
            const relColor = REL_COLORS[edge.relationshipType] || 'text-zinc-400 bg-zinc-800 border-zinc-700';

            const FromIcon = ENTITY_ICONS[fromNode?.type || ''] || Building2;
            const ToIcon = ENTITY_ICONS[toNode?.type || ''] || Building2;

            return (
              <div key={i} className="rounded-lg border border-zinc-800 overflow-hidden">
                <button
                  onClick={() => setExpandedEdgeId(isExpanded ? null : edgeKey)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/30 transition-colors text-left"
                >
                  <FromIcon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span className="text-xs font-semibold text-zinc-200 truncate max-w-[100px]">
                    {fromNode?.name || 'Unknown'}
                  </span>
                  <Badge variant="outline" className={`text-[9px] h-4 px-1.5 font-mono border shrink-0 ${relColor}`}>
                    {edge.relationshipType.replace('_', ' ')}
                  </Badge>
                  <ToIcon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span className="text-xs font-semibold text-zinc-200 truncate max-w-[100px]">
                    {toNode?.name || 'Unknown'}
                  </span>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {(edge.confidenceScore * 100).toFixed(0)}%
                    </span>
                    <span className="text-[9px] text-zinc-600">×{edge.evidenceCount}</span>
                    {isExpanded
                      ? <ChevronDown className="h-3 w-3 text-zinc-500" />
                      : <ChevronRight className="h-3 w-3 text-zinc-500" />
                    }
                  </div>
                </button>

                {isExpanded && edge.evidence.length > 0 && (
                  <div className="border-t border-zinc-800 bg-zinc-950/50 p-2.5 space-y-2">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Evidence</p>
                    {edge.evidence.slice(0, 2).map((ev, j) => (
                      <div key={j} className="p-2 bg-zinc-900 rounded border border-zinc-800">
                        <Badge variant="outline" className="text-[8px] h-3 px-1 mb-1 border-zinc-700 text-zinc-400">
                          {ev.sourceType}
                        </Badge>
                        <p className="text-[10px] text-zinc-400 italic leading-relaxed">
                          &ldquo;{ev.sourceExcerpt}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
