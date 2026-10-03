import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Clinic Hub | Inbound Triage & Reputation System',
  description: 'Clinical telephone triage console, real-time intake telemetry, and patient checkout reputation tracking.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Clinic Hub',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#fafaf9',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#fafaf9] text-[#18181b] min-h-screen antialiased flex flex-col font-sans selection:bg-orange-500/20 selection:text-orange-950">
        <Navbar />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
