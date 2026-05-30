import { AIProviderStatus } from '@/components/ai-operations/AIProviderStatus';
import { Activity, ShieldCheck, Database, Server } from 'lucide-react';

export default function AIOperationsPage() {
  return (
    <div className="space-y-6 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Activity className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">AI Operations Center</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Free-First Multi-Provider Orchestration & Local Inference Monitoring
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs font-medium text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Zero-Fabrication Active
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Telemetry */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
            <Server className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-300">Provider Health & Telemetry</h2>
          </div>
          <AIProviderStatus />
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-blue-950/20 border border-blue-900/30 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2 mb-3">
              <Database className="h-4 w-4" />
              Routing Architecture
            </h3>
            <ul className="text-xs text-zinc-400 space-y-3">
              <li>
                <strong className="text-zinc-300 block mb-0.5">Heavy Reasoning:</strong>
                DeepSeek → Gemini Flash → OpenRouter → Local Ollama
              </li>
              <li>
                <strong className="text-zinc-300 block mb-0.5">Fast Classification:</strong>
                Groq → Gemini Flash → Local Ollama
              </li>
              <li>
                <strong className="text-zinc-300 block mb-0.5">Semantic Embeddings:</strong>
                Local Nomic (Ollama) → Deterministic Hash
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
