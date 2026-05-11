import type { Metadata } from 'next';
import { AutoRefresh } from '@/components/AutoRefresh';
import { GlobalLoadingSequence } from '@/components/GlobalLoadingSequence';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pancake Monitor',
  description: 'Real-time monitoring dashboard for Pancake page health',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        <AutoRefresh />
        <GlobalLoadingSequence />
        <header className="border-b border-slate-800 bg-slate-900">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* <span className="text-2xl">🥞</span> */}
              <h1 className="text-lg font-semibold">Pancake Page Monitoring</h1>
            </div>
            <nav className="flex gap-4 text-sm">
              <a href="/" className="text-slate-300 hover:text-white">
                Overview
              </a>
              <a href="/pages" className="text-slate-300 hover:text-white">
                Pages
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
