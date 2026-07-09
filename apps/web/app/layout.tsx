import type { Metadata } from 'next';
import { Inter, Lora, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ReactQueryProvider } from '../components/providers/tanstack-provider';
import { AppShell } from '../components/layout/app-shell';
import { cn } from '@/lib/utils';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const fontSerif = Lora({
  subsets: ['latin'],
  variable: '--font-serif',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'ContractIQ — Logistics Audit Engine',
  description: 'Contract intelligence and invoice audit for logistics',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en' className={cn(fontSans.variable, fontSerif.variable, fontMono.variable)}>
      <body className='bg-background text-foreground antialiased'>
        <ReactQueryProvider>
          <AppShell>{children}</AppShell>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
