import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Clinical Care Hub | EHR Call Triage & Reputation System',
  description: 'High-fidelity healthcare application for doctors. Electronic health record call triage, clinical telemetry, and patient reputation management.',
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
  themeColor: '#095d7e',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#f8f9fa] text-[#1e293b] min-h-screen antialiased flex flex-col font-sans selection:bg-[#095d7e]/20 selection:text-[#095d7e]">
        <Navbar />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
