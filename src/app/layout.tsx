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
