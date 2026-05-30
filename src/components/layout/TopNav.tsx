'use client';

import { Search, Bell, Settings, Command } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function TopNav() {
  return (
    <div className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-x-4 border-b border-zinc-900/80 bg-zinc-950/40 px-4 shadow-2xl backdrop-blur-xl sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6 items-center">
        
        {/* Search command launcher widget */}
        <div className="relative flex flex-1 max-w-md h-9 rounded-lg bg-zinc-900/40 border border-zinc-900 hover:border-zinc-800 focus-within:border-blue-500/50 transition-all duration-300 items-center px-3 group">
          <Search
            className="h-4 w-4 text-zinc-500 group-hover:text-zinc-350 transition-colors pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="search-field"
            className="block h-full w-full border-0 bg-transparent py-0 pl-2 pr-10 text-xs text-zinc-150 placeholder:text-zinc-650 focus:outline-none focus:ring-0 font-mono"
            placeholder="Search terminal, symbols, signals..."
            type="search"
            name="search"
          />
          <div className="absolute right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950/60 text-[9px] font-bold text-zinc-600 font-mono pointer-events-none select-none">
            <Command size={8} />
            <span>K</span>
          </div>
        </div>

        <div className="flex flex-1" />

        {/* Right Nav Options */}
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <button
            type="button"
            className="relative p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/20 border border-transparent hover:border-zinc-900 transition-all duration-200 group"
          >
            <span className="sr-only">View notifications</span>
            <Bell className="h-4.5 w-4.5 group-hover:scale-105 transition-transform" aria-hidden="true" />
            <span className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
          </button>

          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-zinc-900" aria-hidden="true" />

          <button
            type="button"
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/20 border border-transparent hover:border-zinc-900 transition-all duration-200 group"
          >
            <span className="sr-only">Settings</span>
            <Settings className="h-4.5 w-4.5 group-hover:rotate-45 transition-transform duration-300" aria-hidden="true" />
          </button>

          <div className="h-6 w-px bg-zinc-900" aria-hidden="true" />

          {/* User profile avatar */}
          <div className="flex items-center gap-2 group cursor-pointer">
            <Avatar className="h-7 w-7 border border-zinc-800 group-hover:border-zinc-700 transition-all shadow-md">
              <AvatarImage src="" alt="User" />
              <AvatarFallback className="bg-gradient-to-br from-blue-900/30 to-zinc-900 text-[10px] font-black text-blue-400 font-mono">
                TR
              </AvatarFallback>
            </Avatar>
            <span className="hidden md:inline-block text-[10px] font-black font-mono text-zinc-500 tracking-wider group-hover:text-zinc-350 transition-colors uppercase">
              TERMINAL.ACTIVE
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
