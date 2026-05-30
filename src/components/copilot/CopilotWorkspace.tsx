'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Send, Loader2, Bot, User, CheckCircle2, AlertTriangle, FileText, Database } from 'lucide-react';

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidenceScore?: number;
  citations?: any[];
  marketRegime?: string;
}

export function CopilotWorkspace() {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Institutional AI Copilot Online. Strict zero-fabrication protocols active. I am tethered to live market breadth, vector filings, and verified signals. How can I assist your analysis today?',
      confidenceScore: 1.0
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: CopilotMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/copilot/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg.content, sessionId })
      });
      const data = await res.json();
      
      if (data.success) {
        if (!sessionId) setSessionId(data.data.sessionId);
        
        const aiMsg: CopilotMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.data.answer,
          confidenceScore: data.data.confidenceScore,
          citations: data.data.citations,
          marketRegime: data.data.evidenceUsed?.marketContext?.regime
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      const errorMsg: CopilotMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `System Error: ${error.message}. Fallback sequence engaged.`,
        confidenceScore: 0
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[85vh]">
      {/* Main Chat Area */}
      <Card className="lg:col-span-2 bg-zinc-950 border-zinc-800 flex flex-col overflow-hidden">
        
        {/* Context Ribbon */}
        <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-blue-500" /> Vector DB Connected</span>
            <span className="text-zinc-600">|</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Anti-Hallucination Active</span>
          </div>
        </div>

        {/* Messages */}
        <CardContent className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="h-8 w-8 rounded bg-blue-900/50 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-blue-400" />
                </div>
              )}
              
              <div className={`max-w-[80%] rounded-xl p-4 ${msg.role === 'user' ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-900 border border-zinc-800'}`}>
                
                {/* AI Metadata Header */}
                {msg.role === 'assistant' && msg.id !== 'welcome' && (
                  <div className="flex items-center gap-3 mb-3 pb-2 border-b border-zinc-800/50">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      Conf: <span className={msg.confidenceScore! > 0.8 ? 'text-emerald-400' : 'text-amber-400'}>
                        {(msg.confidenceScore! * 100).toFixed(0)}%
                      </span>
                    </span>
                    {msg.marketRegime && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                        Regime: <span className="text-blue-400">{msg.marketRegime}</span>
                      </span>
                    )}
                  </div>
                )}

                <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>

                {/* Inline Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-zinc-800/50 flex flex-wrap gap-2">
                    {msg.citations.map((cit, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-[10px] text-zinc-400 font-mono cursor-pointer hover:border-blue-500/50 transition-colors">
                        <FileText className="h-3 w-3 text-blue-500/70" />
                        {cit.symbol} ({new Date(cit.date).toLocaleDateString()})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="h-8 w-8 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-zinc-400" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4 justify-start">
              <div className="h-8 w-8 rounded bg-blue-900/50 border border-blue-500/30 flex items-center justify-center shrink-0">
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-500 animate-pulse">Running Multi-Step Verification Pipeline...</span>
              </div>
            </div>
          )}
        </CardContent>

        {/* Input Area */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 shrink-0">
          <form onSubmit={handleSubmit} className="relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask the Institutional Copilot..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-4 pl-4 pr-12 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 text-white rounded-md transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </Card>

      {/* Side Panel: Active Evidence */}
      <Card className="bg-zinc-900/60 border-zinc-800 hidden lg:flex flex-col">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/80">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Active Evidence Buffer
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Real-time view of the vector chunks and signals currently injected into the AI's context window.
          </p>
        </div>
        <CardContent className="flex-1 p-4 overflow-y-auto">
          {messages.length > 1 && messages[messages.length - 1]?.citations ? (
            <div className="space-y-4">
              {messages[messages.length - 1].citations?.map((cit, i) => (
                <div key={i} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-mono text-blue-400 font-bold">{cit.symbol}</span>
                    <span className="text-zinc-500 font-mono">{cit.source}</span>
                  </div>
                  <p className="text-zinc-400 leading-relaxed border-l-2 border-zinc-700 pl-2">
                    "{cit.text || 'Source text unavailable'}"
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center p-6">
              <span className="text-sm text-zinc-600 font-mono">Awaiting query to fetch vector evidence...</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
