import type { Metadata, Viewport } from 'next';
import Header from '@/components/layout/Header';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'BBX Arena', template: '%s · BBX Arena' },
  description: '1v1 beatbox battles with the bass intact. Profiles, ratings, live battles and public votes.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}
