import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'ShaadiPilot',
  description: 'A shared space to plan your Indian wedding together.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
