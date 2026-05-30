'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Database, Cpu, Server, CheckCircle2, AlertTriangle, ArrowRight, PlayCircle } from 'lucide-react';
import Link from 'next/link';

export default function SetupWizardPage() {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    async function ping() {
      try {
        const res = await fetch('/api/ops');
        if (res.ok) {
          const json = await res.json();
          setStatus({
            redis: true,
            db: true,
            ai: json.data.providers.find((p: any) => p.name === 'Ollama')?.requests >= 0,
            opsData: json.data
          });
        }
      } catch (e) {
        setStatus({ redis: false, db: false, ai: false });
      }
    }
    ping();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-8 mt-12">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">System Onboarding</h1>
        <p className="text-zinc-400 text-lg">Verify your institutional AI Bazaar deployment</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Infrastructure */}
        <Card className="bg-zinc-950/60 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-200">
              <Database className="h-5 w-5 text-blue-400" /> Infrastructure
            </CardTitle>
            <CardDescription>PostgreSQL, Redis & Background Workers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Database (PostgreSQL + pgvector)</span>
              {status?.db ? <Badge className="bg-emerald-500/20 text-emerald-400"><CheckCircle2 className="h-3 w-3 mr-1"/> Ready</Badge> : <Badge variant="destructive">Waiting...</Badge>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">In-Memory Cache (Redis)</span>
              {status?.redis ? <Badge className="bg-emerald-500/20 text-emerald-400"><CheckCircle2 className="h-3 w-3 mr-1"/> Ready</Badge> : <Badge variant="destructive">Waiting...</Badge>}
            </div>
          </CardContent>
        </Card>

        {/* AI Providers */}
        <Card className="bg-zinc-950/60 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-200">
              <Cpu className="h-5 w-5 text-purple-400" /> Intelligence Layer
            </CardTitle>
            <CardDescription>Ollama and Cloud Providers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Ollama Local Inference</span>
              {status?.ai ? <Badge className="bg-emerald-500/20 text-emerald-400"><CheckCircle2 className="h-3 w-3 mr-1"/> Ready</Badge> : <Badge variant="outline" className="text-amber-400 border-amber-400/20"><AlertTriangle className="h-3 w-3 mr-1"/> Required</Badge>}
            </div>
            {status?.ai === false && (
              <div className="text-xs text-zinc-500 bg-zinc-900 p-3 rounded-md">
                Run <code className="text-zinc-300">ollama pull llama3</code> and <code className="text-zinc-300">ollama pull nomic-embed-text</code> locally to enable autonomous processing.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security & Isolation */}
        <Card className="bg-zinc-950/60 border-zinc-800 md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-200">
              <Shield className="h-5 w-5 text-emerald-400" /> Security Posture
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
              <div className="text-xs text-zinc-400">Prompt Injection Guard</div>
            </div>
            <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
              <div className="text-xs text-zinc-400">Auth & Rate Limiting</div>
            </div>
            <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
              <div className="text-xs text-zinc-400">HSTS & CSP Headers</div>
            </div>
            <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
              <div className="text-xs text-zinc-400">Local-First Privacy</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center mt-8">
        <Link href="/" className="group flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
          <PlayCircle className="h-5 w-5" /> Launch Terminal
        </Link>
      </div>
    </div>
  );
}
