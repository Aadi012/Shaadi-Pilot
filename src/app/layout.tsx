import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';

const manrope = localFont({
  src: '../../public/fonts/manrope.ttf',
  variable: '--font-body',
  display: 'swap',
  weight: '200 800',
});

const newsreader = localFont({
  src: [
    {
      path: '../../public/fonts/newsreader-roman.ttf',
      weight: '200 800',
      style: 'normal',
    },
    {
      path: '../../public/fonts/newsreader-italic.ttf',
      weight: '200 800',
      style: 'italic',
    },
  ],
  variable: '--font-heading',
  display: 'swap',
});

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'ShaadiPilot — Plan together. Celebrate more.',
  description:
    'One shared space for your Indian wedding: plan every function, share tasks, manage invitations and RSVPs, and bring your family together.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
