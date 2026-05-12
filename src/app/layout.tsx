import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Page Monitor',
  description: 'Real-time monitoring dashboard for page health',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
