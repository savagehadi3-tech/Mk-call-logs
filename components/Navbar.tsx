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
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#f8f9fa]/90 border-b border-[#e7ebef] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
        {/* Brand & Physician Identity */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-[#095d7e] flex items-center justify-center shadow-[0_2px_10px_rgba(9,93,126,0.25)] text-white transition-transform group-hover:scale-105 active:scale-95">
            <Stethoscope className="w-5 h-5 text-white stroke-[2.2]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-[#1e293b]">
                Clinical Care Hub
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#eaf4f8] text-[#095d7e] border border-[#c3dfeb]">
                Physician Station
              </span>
            </div>
            <span className="text-[11px] text-[#64748b] font-normal hidden sm:block">
              Electronic Health Records & Patient Telephony Triage
            </span>
          </div>
        </Link>

        {/* High-Fidelity Navigation */}
        <div className="flex items-center gap-3">
          <nav className="flex items-center bg-[#eef2f5] p-1 rounded-full text-xs font-medium border border-[#e2e8f0]">
            <Link
              href="/"
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all duration-200 ${
                isCallFeedActive
                  ? 'bg-white text-[#095d7e] shadow-[0_1px_4px_rgba(9,93,126,0.08)] font-semibold'
                  : 'text-[#64748b] hover:text-[#095d7e]'
              }`}
            >
              <PhoneCall className={`w-3.5 h-3.5 ${isCallFeedActive ? 'text-[#095d7e]' : 'text-[#64748b]'}`} />
              <span>EHR Triage</span>
            </Link>

            <Link
              href="/reviews"
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all duration-200 ${
                isReviewsActive
                  ? 'bg-white text-[#095d7e] shadow-[0_1px_4px_rgba(9,93,126,0.08)] font-semibold'
                  : 'text-[#64748b] hover:text-[#095d7e]'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isReviewsActive ? 'text-[#095d7e] fill-[#095d7e]' : 'text-[#64748b]'}`} />
              <span>Patient Reviews</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
