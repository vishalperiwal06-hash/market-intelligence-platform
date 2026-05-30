'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Newspaper, ExternalLink, Clock } from 'lucide-react';

interface NewsArticle {
  id: string;
  source: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  category: string;
  symbols: string[] | null;
}

import Link from 'next/link';

export function MarketNewsFeed({ limit = 15, showViewMore = false }: { limit?: number, showViewMore?: boolean }) {
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch(`/api/corporate/news?limit=${limit}`);
        if (res.ok) {
          const json = await res.json();
          setNews(json.news);
        }
      } catch (err) {
        // graceful degrade
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
    const interval = setInterval(fetchNews, 60000);
    return () => clearInterval(interval);
  }, [limit]);

  const getSourceColor = (source: string) => {
    if (source === 'Moneycontrol') return 'text-orange-400';
    if (source === 'Mint') return 'text-orange-500'; // Mint orange
    if (source === 'Economic Times') return 'text-rose-400';
    if (source === 'CNBC') return 'text-blue-500';
    return 'text-zinc-400';
  };

  const getTimeAgo = (ts: string) => {
    const diffMs = Date.now() - new Date(ts).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 flex flex-col h-full">
      <CardHeader className="pb-3 border-b border-zinc-800 shrink-0 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-purple-400" />
          Financial News Feed
        </CardTitle>
        {showViewMore && (
          <Link href="/news" className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase font-mono">
            View All →
          </Link>
        )}
      </CardHeader>
      <CardContent className="p-0 overflow-y-auto flex-1 min-h-[300px]">
        {loading && news.length === 0 ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-3 bg-zinc-800 rounded w-full"></div>
                <div className="h-3 bg-zinc-800 rounded w-5/6"></div>
              </div>
            ))}
          </div>
        ) : news.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-8">
            <Newspaper className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No recent news</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {news.map((article, idx) => (
              <div key={`${article.id}-${idx}`} className="p-3 hover:bg-zinc-800/20 transition-colors group">
                <a href={article.link} target="_blank" rel="noopener noreferrer" className="block">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${getSourceColor(article.source)}`}>
                      {article.source}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <Clock className="h-3 w-3" />
                      {getTimeAgo(article.pubDate)}
                    </div>
                  </div>
                  
                  <h4 className="text-sm font-medium text-zinc-200 group-hover:text-purple-400 transition-colors line-clamp-2 leading-snug mb-1.5">
                    {article.title}
                  </h4>
                  
                  {article.symbols && article.symbols.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {article.symbols.map(sym => (
                        <Badge key={sym} variant="outline" className="text-[9px] h-4 px-1.5 bg-zinc-950 border-zinc-800 text-zinc-300 font-mono">
                          {sym}
                        </Badge>
                      ))}
                    </div>
                  )}
                </a>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
