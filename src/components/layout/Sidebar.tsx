'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, LineChart, FileText, Newspaper, Search, BookOpen,
  Activity, Building2, Brain, Compass, Target, Bot, Briefcase,
  Menu, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Portfolio', href: '/portfolio', icon: Briefcase },
  { name: 'Copilot', href: '/copilot', icon: Bot },
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Screener', href: '/screener', icon: Search },
  { name: 'Corporate', href: '/corporate', icon: Building2 },
  { name: 'Knowledge Graph', href: '/knowledge-graph', icon: Brain },
  { name: 'Context', href: '/market-context', icon: Compass },
  { name: 'Semantic Search', href: '/semantic-search', icon: Target },
  { name: 'Market', href: '/market', icon: LineChart },
  { name: 'Filings', href: '/filings', icon: FileText },
  { name: 'News', href: '/news', icon: Newspaper },
  { name: 'Journal', href: '/journal', icon: BookOpen },
  { name: 'Signals', href: '/signals', icon: Activity },
];

interface SidebarContentProps {
  collapsed?: boolean;
  onLinkClick?: () => void;
}

function SidebarContent({ collapsed = false, onLinkClick }: SidebarContentProps) {
  const pathname = usePathname();

  return (
    <>
      <div className={cn(
        "flex h-16 shrink-0 items-center border-b border-zinc-900 transition-all duration-300",
        collapsed ? "justify-center px-0" : "px-6"
      )}>
        <div className="flex items-center gap-2.5 group">
          <div className="relative flex items-center justify-center h-8 w-8 rounded-lg bg-blue-600/10 border border-blue-500/30 group-hover:border-blue-500 transition-all duration-300">
            <Activity className="h-4.5 w-4.5 text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          {!collapsed && (
            <span className="text-sm font-black tracking-widest text-zinc-150 font-mono uppercase bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent group-hover:to-zinc-100 transition-all">
              AI BAZAAR
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4 scrollbar-thin">
        <nav className="flex-1 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onLinkClick}
                title={collapsed ? item.name : undefined}
                className={cn(
                  isActive
                    ? 'bg-blue-600/10 border-blue-500/20 text-blue-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'
                    : 'text-zinc-400 border-transparent hover:bg-zinc-900/40 hover:text-zinc-150',
                  'group flex items-center rounded-lg px-3 py-2.5 text-xs font-semibold font-mono tracking-wide border transition-all duration-200',
                  collapsed ? 'justify-center px-0' : 'gap-x-3'
                )}
              >
                <item.icon
                  className={cn(
                    isActive ? 'text-blue-400 scale-105' : 'text-zinc-500 group-hover:text-zinc-300 group-hover:scale-105',
                    'h-4 w-4 shrink-0 transition-all duration-200'
                  )}
                  aria-hidden="true"
                />
                {!collapsed && (
                  <span className="truncate transition-opacity duration-300">
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={cn(
        "border-t border-zinc-900 p-4 transition-all duration-300 bg-zinc-950/40",
        collapsed ? "flex justify-center" : ""
      )}>
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          </div>
          {!collapsed && (
            <span className="text-[10px] font-black font-mono tracking-widest text-zinc-550 uppercase">
              LIVE DATASTREAM
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Load persistence state
  useEffect(() => {
    const cached = localStorage.getItem('sidebar-collapsed');
    if (cached) {
      setCollapsed(cached === 'true');
    }
  }, []);

  const toggleCollapse = () => {
    const nextState = !collapsed;
    setCollapsed(nextState);
    localStorage.setItem('sidebar-collapsed', String(nextState));
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg hover:border-zinc-800 transition-all lg:hidden shadow-lg"
        aria-label="Open menu"
      >
        <Menu className="h-4.5 w-4.5 text-zinc-300" />
      </button>

      {/* Mobile overlay sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-fade-in" />
          <div
            className="fixed inset-y-0 left-0 w-64 bg-zinc-950 border-r border-zinc-900 flex flex-col z-50 animate-slide-in-left"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4.5 right-4.5 p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent collapsed={false} onLinkClick={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className={cn(
        "hidden lg:flex h-full flex-col bg-zinc-950/98 border-r border-zinc-900 shrink-0 relative transition-all duration-300 shadow-2xl",
        collapsed ? "w-16" : "w-60"
      )}>
        <SidebarContent collapsed={collapsed} />
        
        {/* Collapse toggle button widget */}
        <button
          onClick={toggleCollapse}
          className="absolute bottom-16 -right-3 h-6 w-6 rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-all shadow-md z-40 hover:scale-105"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>
    </>
  );
}
