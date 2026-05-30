'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Clock, TrendingUp, DollarSign, Megaphone, Handshake,
  AlertTriangle, Newspaper, BarChart2, UserCheck, Zap,
} from 'lucide-react';

interface TimelineEvent {
  eventType: string;
  title: string;
  description: string;
  significance: string;
  eventDate: string;
  sourceType: string;
}

const EVENT_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  borderColor: string;
}> = {
  EARNINGS:          { icon: BarChart2,    color: 'text-emerald-400', borderColor: 'border-emerald-500/50' },
  ACQUISITION:       { icon: Handshake,    color: 'text-blue-400',    borderColor: 'border-blue-500/50' },
  CAPEX_ANNOUNCE:    { icon: DollarSign,   color: 'text-purple-400',  borderColor: 'border-purple-500/50' },
  CONCALL:           { icon: Megaphone,    color: 'text-amber-400',   borderColor: 'border-amber-500/50' },
  GUIDANCE_UPDATE:   { icon: TrendingUp,   color: 'text-cyan-400',    borderColor: 'border-cyan-500/50' },
  NEWS:              { icon: Newspaper,    color: 'text-zinc-400',    borderColor: 'border-zinc-600' },
  TECHNICAL_BREAKOUT:{ icon: Zap,          color: 'text-yellow-400',  borderColor: 'border-yellow-500/50' },
  MANAGEMENT_CHANGE: { icon: UserCheck,    color: 'text-pink-400',    borderColor: 'border-pink-500/50' },
  POLICY_TAILWIND:   { icon: AlertTriangle,color: 'text-orange-400',  borderColor: 'border-orange-500/50' },
  PARTNERSHIP:       { icon: Handshake,    color: 'text-teal-400',    borderColor: 'border-teal-500/50' },
};

const SIGNIFICANCE_COLORS: Record<string, string> = {
  HIGH:   'bg-rose-500/20 text-rose-400 border-rose-500/30',
  MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  LOW:    'bg-zinc-800 text-zinc-500 border-zinc-700',
};

interface Props {
  symbol: string;
}

export function CompanyEventTimeline({ symbol }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/knowledge-graph/timeline?symbol=${symbol}&limit=40`);
        if (res.ok) {
          const json = await res.json();
          setEvents(json.timeline || []);
        }
      } catch { /* graceful */ }
      finally { setLoading(false); }
    };
    fetchData();
  }, [symbol]);

  const eventTypes = ['ALL', ...new Set(events.map(e => e.eventType))];
  const filtered = filter === 'ALL' ? events : events.filter(e => e.eventType === filter);

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800">
        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          Company Intelligence Timeline
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-zinc-950 border-zinc-700 text-zinc-300 font-mono">
            {symbol}
          </Badge>
        </CardTitle>
        {/* Filter pills */}
        {eventTypes.length > 1 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {eventTypes.map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`text-[9px] px-2 py-0.5 rounded-full border font-mono transition-colors ${
                  filter === type
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 max-h-[450px] overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-zinc-800/60 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-sm">
            No timeline events found for {symbol}.
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[22px] top-0 bottom-0 w-px bg-zinc-800/80" />
            <div className="py-2">
              {filtered.map((event, i) => {
                const config = EVENT_CONFIG[event.eventType] || EVENT_CONFIG.NEWS;
                const EventIcon = config.icon;
                const sigColor = SIGNIFICANCE_COLORS[event.significance] || SIGNIFICANCE_COLORS.LOW;

                return (
                  <div
                    key={i}
                    className={`relative flex gap-3 px-4 py-3 hover:bg-zinc-800/20 transition-colors border-l-2 ml-[21px] ${
                      event.significance === 'HIGH' ? 'border-rose-500/40' : 'border-transparent'
                    }`}
                  >
                    {/* Timeline icon */}
                    <div className={`
                      absolute -left-[13px] flex-shrink-0 w-6 h-6 rounded-full 
                      bg-zinc-950 border-2 flex items-center justify-center z-10
                      ${config.borderColor}
                    `}>
                      <EventIcon className={`h-3 w-3 ${config.color}`} />
                    </div>

                    <div className="flex-1 min-w-0 pl-2">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-200 truncate">{event.title}</span>
                        <Badge variant="outline" className={`text-[8px] h-3.5 px-1 border shrink-0 ${sigColor}`}>
                          {event.significance}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-2">
                        {event.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-zinc-600 font-mono">
                          {new Date(event.eventDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-[9px] text-zinc-700">{event.sourceType}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
