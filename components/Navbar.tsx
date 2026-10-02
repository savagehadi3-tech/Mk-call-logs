'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PhoneCall, Star, Stethoscope } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();

  const isCallFeedActive = pathname === '/';
  const isReviewsActive = pathname === '/reviews';

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#fbfbfd]/80 border-b border-black/[0.07] transition-all">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* Apple-style Clinic Badge */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-xs text-white transition active:scale-95">
            <Stethoscope className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-[#1d1d1f] leading-tight">
              Clinic Hub
            </h1>
            <p className="text-[11px] text-orange-600/90 font-medium">
              Triage & Telephony
            </p>
          </div>
        </Link>

        {/* iOS Native Segmented Control */}
        <div className="flex items-center bg-black/[0.05] p-1 rounded-full text-xs font-medium">
          <Link
            href="/"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-200 ${
              isCallFeedActive
                ? 'bg-white text-[#1d1d1f] shadow-[0_1px_4px_rgba(0,0,0,0.08)] font-semibold'
                : 'text-[#86868b] hover:text-[#1d1d1f]'
            }`}
          >
            <PhoneCall className={`w-3.5 h-3.5 ${isCallFeedActive ? 'text-orange-500' : 'text-[#86868b]'}`} />
            <span>Call Feed</span>
          </Link>

          <Link
            href="/reviews"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-200 ${
              isReviewsActive
                ? 'bg-white text-[#1d1d1f] shadow-[0_1px_4px_rgba(0,0,0,0.08)] font-semibold'
                : 'text-[#86868b] hover:text-[#1d1d1f]'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${isReviewsActive ? 'text-orange-500 fill-orange-500' : 'text-[#86868b]'}`} />
            <span>Reviews</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
