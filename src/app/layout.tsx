import type { Metadata } from 'next';
import { AutoRefresh } from '@/components/AutoRefresh';
import { GlobalLoadingSequence } from '@/components/GlobalLoadingSequence';
import { Sidebar } from '@/components/Sidebar';
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
      <body className="bg-slate-950 text-slate-100 h-screen flex overflow-hidden">
        <AutoRefresh />
        <GlobalLoadingSequence />
        
        <Sidebar />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="border-b border-slate-800 bg-slate-900 flex-shrink-0">
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold">Pancake Page Monitoring</h1>
              </div>
            </div>
          </header>
          
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
