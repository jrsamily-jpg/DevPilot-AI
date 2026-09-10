import type { Metadata } from 'next';
import './globals.css';

const siteUrl = 'https://devpilot-ai.jrsamily.chatgpt.site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'DevPilot AI — Your codebase, on autopilot',
  description: 'An interactive AI software engineering command center that plans, codes, tests, and ships.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    title: 'DevPilot AI — Your codebase, on autopilot',
    description: 'An interactive AI software engineering command center that plans, codes, tests, and ships.',
    images: [{ url: '/og.png', width: 1730, height: 909, alt: 'DevPilot AI command center' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DevPilot AI — Your codebase, on autopilot',
    description: 'An interactive AI software engineering command center that plans, codes, tests, and ships.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
