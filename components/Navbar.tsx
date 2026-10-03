'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PhoneCall, Star, Stethoscope, Activity } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();

  const isCallFeedActive = pathname === '/';
  const isReviewsActive = pathname === '/reviews';

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#fafaf9]/85 border-b border-black/[0.06] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
        {/* Brand & Clinic Identity */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-[0_2px_10px_rgba(249,115,22,0.25)] text-white transition-transform group-hover:scale-105 active:scale-95">
            <Stethoscope className="w-4.5 h-4.5 text-white stroke-[2.2]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-[#18181b]">
                Clinic Hub
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-50 text-orange-700 border border-orange-200/60">
                Medical Desk
              </span>
            </div>
            <span className="text-[11px] text-[#71717a] font-normal hidden sm:block">
              Intake Telephony & Patient Reputation System
            </span>
          </div>
        </Link>

        {/* Apple-style Segmented Control Navigation */}
        <div className="flex items-center gap-3">
          <nav className="flex items-center bg-black/[0.04] p-1 rounded-full text-xs font-medium border border-black/[0.03]">
            <Link
              href="/"
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all duration-200 ${
                isCallFeedActive
                  ? 'bg-white text-[#18181b] shadow-[0_1px_4px_rgba(0,0,0,0.06)] font-semibold'
                  : 'text-[#71717a] hover:text-[#18181b]'
              }`}
            >
              <PhoneCall className={`w-3.5 h-3.5 ${isCallFeedActive ? 'text-orange-600' : 'text-[#71717a]'}`} />
              <span>Call Triage</span>
            </Link>

            <Link
              href="/reviews"
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all duration-200 ${
                isReviewsActive
                  ? 'bg-white text-[#18181b] shadow-[0_1px_4px_rgba(0,0,0,0.06)] font-semibold'
                  : 'text-[#71717a] hover:text-[#18181b]'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isReviewsActive ? 'text-orange-600 fill-orange-500' : 'text-[#71717a]'}`} />
              <span>Checkout & Reviews</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
