import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export const metadata: Metadata = {
  title: 'AI Bazaar | Market Intelligence Terminal',
  description: 'Production-grade AI-powered Indian stock market intelligence platform — NSE, BSE, derivatives, FII/DII flows and more.',
  keywords: 'NSE, BSE, Indian stock market, market intelligence, derivatives, FII, DII, options chain',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <head>
        {/* Load Google Fonts at runtime — safe in Docker since this is a browser <link>, not a build-time fetch */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-zinc-950 text-zinc-50 h-full overflow-hidden flex">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopNav />
          <main className="flex-1 overflow-y-auto bg-zinc-950 p-3 sm:p-4 lg:p-6">
            <ErrorBoundary name="Terminal Core Workspace">
              {children}
            </ErrorBoundary>
          </main>
        </div>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
