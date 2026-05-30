'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Newspaper, ExternalLink, Calendar, Eye } from 'lucide-react';

interface NewsArticle {
  id: string;
  source: string;
  title: string;
  description: string | null;
  link: string;
  pubDate: string;
  symbols: string[] | null;
  sectors: string[] | null;
  category: string | null;
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/corporate/news?limit=30')
      .then((res) => res.json())
      .then((res) => {
        if (res && res.news) {
          setArticles(res.news);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load news:', err);
        setLoading(false);
      });
  }, []);

  const formatPubDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Market News</h1>
        <p className="text-sm text-zinc-400">AI-summarized global and domestic financial news</p>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-zinc-900/50 border-zinc-800 overflow-hidden flex flex-col">
              <div className="h-40 bg-zinc-950 flex items-center justify-center border-b border-zinc-800 shrink-0">
                <Newspaper className="h-10 w-10 text-zinc-800 animate-pulse" />
              </div>
              <CardContent className="p-4 flex-1 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <div className="h-4 w-20 bg-zinc-800 rounded animate-pulse"></div>
                  <div className="h-3 w-12 bg-zinc-800 rounded animate-pulse"></div>
                </div>
                <div className="h-5 w-full bg-zinc-800/80 rounded animate-pulse"></div>
                <div className="h-5 w-4/5 bg-zinc-800/80 rounded animate-pulse"></div>
                <div className="mt-auto pt-4 space-y-2">
                  <div className="h-3 w-full bg-zinc-800/40 rounded animate-pulse"></div>
                  <div className="h-3 w-2/3 bg-zinc-800/40 rounded animate-pulse"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-zinc-500 border border-dashed border-zinc-800 rounded-md bg-zinc-900/10">
          <Newspaper className="h-12 w-12 opacity-20 mb-3" />
          <p className="text-sm">No recent market news articles found in the database.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Card
              key={article.id}
              className="bg-zinc-900/50 border-zinc-800 overflow-hidden flex flex-col hover:border-zinc-700 transition-colors backdrop-blur-md"
            >
              {/* Category and Source Header */}
              <div className="p-4 pb-2 flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  {article.category || 'Macro'}
                </span>
                <span className="text-xs text-zinc-400 font-medium">
                  {article.source}
                </span>
              </div>

              <CardContent className="p-4 pt-1 flex-1 flex flex-col">
                {/* News Title */}
                <h3 className="text-sm font-semibold text-zinc-100 leading-snug hover:text-blue-400 transition-colors duration-150 line-clamp-2">
                  <a href={article.link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1">
                    {article.title}
                  </a>
                </h3>

                {/* News Publication Date */}
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatPubDate(article.pubDate)}</span>
                </div>

                {/* News Description */}
                <p className="text-xs text-zinc-400 leading-relaxed mt-3 line-clamp-3 bg-zinc-950/20 p-2.5 rounded border border-zinc-850/50">
                  {article.description || 'No summary available.'}
                </p>

                {/* Related Symbols & Sectors */}
                {((article.symbols && article.symbols.length > 0) || (article.sectors && article.sectors.length > 0)) && (
                  <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-zinc-850/50">
                    {article.symbols?.map((sym) => (
                      <span
                        key={sym}
                        className="text-[9px] font-bold font-mono tracking-tight text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded"
                      >
                        {sym}
                      </span>
                    ))}
                    {article.sectors?.map((sec) => (
                      <span
                        key={sec}
                        className="text-[9px] font-medium text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded"
                      >
                        {sec}
                      </span>
                    ))}
                  </div>
                )}

                {/* Full Article Link */}
                <div className="mt-auto pt-4 flex justify-end">
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-zinc-100 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded transition-all shrink-0 hover:bg-zinc-800"
                  >
                    Read Article <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
