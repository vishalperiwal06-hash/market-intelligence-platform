'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, FileText, Download, Clock, Briefcase } from 'lucide-react';

interface Filing {
  id: string;
  exchange: string;
  symbol: string;
  companyName: string;
  category: string;
  subject: string;
  broadcastDate: string;
  receiptDate?: string;
  pdfUrl: string | null;
}

import Link from 'next/link';

export function CorporateFilingsFeed({ limit = 15, showViewMore = false }: { limit?: number, showViewMore?: boolean }) {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFilings = async () => {
      try {
        const res = await fetch(`/api/corporate/filings?limit=${limit}`);
        if (res.ok) {
          const json = await res.json();
          setFilings(json.filings);
        }
      } catch (err) {
        // graceful degrade
      } finally {
        setLoading(false);
      }
    };

    fetchFilings();
    const interval = setInterval(fetchFilings, 60000);
    return () => clearInterval(interval);
  }, [limit]);

  const getCategoryColor = (cat: string) => {
    if (cat === 'Financial Results') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (cat === 'Board Meeting') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (cat === 'Dividends') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (cat === 'Acquisitions') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 flex flex-col h-full">
      <CardHeader className="pb-3 border-b border-zinc-800 shrink-0 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-400" />
          Live Exchange Filings
        </CardTitle>
        {showViewMore && (
          <Link href="/filings" className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase font-mono">
            View All →
          </Link>
        )}
      </CardHeader>
      <CardContent className="p-0 overflow-y-auto flex-1 min-h-[300px]">
        {loading && filings.length === 0 ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="h-10 w-10 bg-zinc-800 rounded"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-zinc-800 rounded w-1/3"></div>
                  <div className="h-3 bg-zinc-800 rounded w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-8">
            <Briefcase className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No recent filings</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {filings.map((filing, idx) => (
              <div 
                key={`${filing.id}-${idx}`} 
                onClick={() => filing.pdfUrl && window.open(filing.pdfUrl, '_blank')}
                className={`p-3.5 hover:bg-zinc-800/30 transition-all border-b border-zinc-800/40 relative group ${filing.pdfUrl ? 'cursor-pointer' : ''}`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-100 text-sm tracking-wide group-hover:text-blue-400 transition-colors">{filing.symbol}</span>
                    <Badge variant="outline" className={`text-[9px] h-4 px-1.5 font-mono ${getCategoryColor(filing.category)}`}>
                      {filing.category}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                    <Clock className="h-3 w-3 text-zinc-500" />
                    {(() => {
                      const bDateParsed = new Date(filing.broadcastDate);
                      let exchangeDate = bDateParsed;
                      if (bDateParsed.getHours() === 5 && bDateParsed.getMinutes() === 30 && bDateParsed.getSeconds() === 0 && filing.receiptDate) {
                        exchangeDate = new Date(filing.receiptDate);
                      }
                      return exchangeDate.toLocaleString('en-IN', { 
                        day: 'numeric', 
                        month: 'short', 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        hour12: true 
                      });
                    })()}
                  </div>
                </div>
                
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed font-sans group-hover:text-zinc-200 transition-colors">
                  {filing.subject}
                </p>

                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[9px] text-zinc-500 font-medium tracking-wider uppercase">{filing.companyName} • {filing.exchange}</span>
                  {filing.pdfUrl && (
                    <span 
                      className="flex items-center gap-1 text-[10px] text-blue-400 group-hover:text-blue-300 font-semibold bg-blue-500/10 px-2 py-0.5 rounded transition-all"
                    >
                      <Download className="h-3 w-3 shrink-0" />
                      PDF Link
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
