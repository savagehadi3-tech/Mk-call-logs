import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Clinic Hub | Apple iOS Medical Dashboard',
  description: 'Clean medical call triage, patient checkout surveys, and real-time intake telemetry.',
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
  themeColor: '#f5f5f7',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#f5f5f7] text-[#1d1d1f] min-h-screen antialiased flex flex-col font-sans selection:bg-orange-500/20 selection:text-orange-950">
        <Navbar />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
