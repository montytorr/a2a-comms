import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'A2A Comms — Control Panel',
  description: 'Agent-to-agent communication platform',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/a2a-comms-favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
  themeColor: '#06b6d4',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="bg-[#06060b] text-gray-100 antialiased font-[family-name:var(--font-inter)]">
        {/* Animated mesh gradient background */}
        <div className="mesh-gradient-bg" />
        {/* Noise texture overlay */}
        <div className="noise-overlay" />
        {/* Content */}
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
