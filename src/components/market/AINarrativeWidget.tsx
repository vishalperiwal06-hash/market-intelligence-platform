'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrainCircuit, Sparkles, AlertCircle } from 'lucide-react';

interface Narrative {
  content: string;
  timestamp: string;
  modelUsed: string;
}

export function AINarrativeWidget() {
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNarrative = async () => {
      try {
        const res = await fetch('/api/ai/narrative');
        if (res.ok) {
          const json = await res.json();
          setNarrative(json.narrative);
        }
      } catch {
        // Handle error silently
      } finally {
        setLoading(false);
      }
    };

    fetchNarrative();
    const interval = setInterval(fetchNarrative, 60000); // 1m poll for updates
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-3 opacity-20 pointer-events-none">
        <BrainCircuit className="h-24 w-24 text-blue-500" />
      </div>
      
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            AI Market Strategist
          </div>
          {narrative && (
            <span className="text-[10px] text-zinc-500 font-mono">
              Powered by {narrative.modelUsed}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-4 relative z-10">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-3 bg-zinc-800/80 rounded w-full"></div>
            <div className="h-3 bg-zinc-800/80 rounded w-5/6"></div>
            <div className="h-3 bg-zinc-800/80 rounded w-4/6"></div>
          </div>
        ) : narrative ? (
          <div className="space-y-4">
            {narrative.content.split('\n\n').map((paragraph, i) => (
              <p key={i} className="text-xs text-zinc-300 leading-relaxed">
                {paragraph}
              </p>
            ))}
            <div className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/50 flex justify-between">
              <span>Auto-generated based on quantitative data.</span>
              <span>Last updated: {new Date(narrative.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-zinc-500 text-xs">
            <AlertCircle className="h-4 w-4" />
            Waiting for sufficient market data to generate narrative...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
