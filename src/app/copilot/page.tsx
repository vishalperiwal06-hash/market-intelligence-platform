import { CopilotWorkspace } from '@/components/copilot/CopilotWorkspace';
import { Bot, ShieldCheck } from 'lucide-react';

export default function CopilotPage() {
  return (
    <div className="space-y-4 max-w-[1700px] mx-auto h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Bot className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">Institutional Copilot</h1>
            <p className="text-xs text-zinc-500">
              Evidence-grounded conversational intelligence engine
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-emerald-900/50 rounded-md text-xs font-medium text-emerald-400">
            <ShieldCheck className="h-4 w-4" />
            Zero-Fabrication Guard Active
          </div>
        </div>
      </div>

      <div className="flex-1">
        <CopilotWorkspace />
      </div>
    </div>
  );
}
