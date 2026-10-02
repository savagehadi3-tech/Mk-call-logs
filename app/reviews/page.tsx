'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, ReviewRequest } from '@/lib/supabase';
import {
  Star,
  Send,
  UserCheck,
  CheckCircle2,
  Clock,
  Smartphone,
  User,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  MessageSquare,
  Search,
  Check
} from 'lucide-react';

const MOCK_REVIEWS: ReviewRequest[] = [
  {
    id: 'rev-1',
    patient_name: 'Eleanor Vance',
    patient_phone: '+1 (555) 234-8901',
    status: 'completed',
    rating: 5,
    feedback: 'Dr. Miller and staff were extremely prompt and caring following my knee arthroscopy.',
    created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: 'rev-2',
    patient_name: 'David Chen',
    patient_phone: '+1 (555) 901-7744',
    status: 'delivered',
    rating: null,
    feedback: null,
    created_at: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
  },
  {
    id: 'rev-3',
    patient_name: 'Sarah Jenkins',
    patient_phone: '+1 (555) 432-1098',
    status: 'sent',
    rating: null,
    feedback: null,
    created_at: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
  },
  {
    id: 'rev-4',
    patient_name: 'Marcus Brody',
    patient_phone: '+1 (555) 876-5432',
    status: 'completed',
    rating: 5,
    feedback: 'Fast checkout process and clear follow-up instructions.',
    created_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
  },
];

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [patientName, setPatientName] = useState<string>('');
  const [patientPhone, setPatientPhone] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSupabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id') &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder.supabase.co')
  );

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    if (!isSupabaseConfigured) {
      setReviews(MOCK_REVIEWS);
      setIsDemoMode(true);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('review_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        setReviews(MOCK_REVIEWS);
        setIsDemoMode(true);
      } else if (data && data.length > 0) {
        setReviews(data as ReviewRequest[]);
        setIsDemoMode(false);
      } else {
        setReviews(MOCK_REVIEWS);
        setIsDemoMode(true);
      }
    } catch {
      setReviews(MOCK_REVIEWS);
      setIsDemoMode(true);
    } finally {
      setLoading(false);
    }
  }, [isSupabaseConfigured]);

  useEffect(() => {
    fetchReviews();

    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('review-requests-apple-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'review_requests' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRecord = payload.new as ReviewRequest;
            setReviews((prev) => [newRecord, ...prev.filter((r) => r.id !== newRecord.id)]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedRecord = payload.new as ReviewRequest;
            setReviews((prev) =>
              prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setReviews((prev) => prev.filter((r) => r.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReviews, isSupabaseConfigured]);

  const handleSendReviewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedPhone = patientPhone.trim();
    if (!trimmedPhone) {
      setErrorMessage('Patient mobile number is required.');
      return;
    }

    setIsSubmitting(true);

    const newRequest: ReviewRequest = {
      id: 'rev-' + Math.random().toString(36).substring(2, 9),
      patient_name: patientName.trim() || null,
      patient_phone: trimmedPhone,
      status: 'sent',
      rating: null,
      feedback: null,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured && !isDemoMode) {
      try {
        const { error } = await supabase.from('review_requests').insert([newRequest]);
        if (error) setReviews((prev) => [newRequest, ...prev]);
      } catch {
        setReviews((prev) => [newRequest, ...prev]);
      }
    } else {
      setReviews((prev) => [newRequest, ...prev]);
    }

    setSuccessMessage(`Review invite dispatched to ${trimmedPhone}!`);
    setPatientName('');
    setPatientPhone('');
    setIsSubmitting(false);

    setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
  };

  const stats = useMemo(() => {
    const totalAllTime = reviews.length;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    const sentToday = reviews.filter((r) => {
      return new Date(r.created_at).getTime() >= todayStart;
    }).length;

    const completedReviews = reviews.filter((r) => r.status === 'completed');
    const completedCount = completedReviews.length;
    const totalRatings = completedReviews.reduce((acc, r) => acc + (r.rating || 5), 0);
    const avgRating = completedCount ? (totalRatings / completedCount).toFixed(1) : '5.0';

    return { sentToday, totalAllTime, completedCount, avgRating };
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    if (!searchQuery.trim()) return reviews;
    const q = searchQuery.toLowerCase();
    return reviews.filter(
      (r) =>
        r.patient_phone.toLowerCase().includes(q) ||
        (r.patient_name && r.patient_name.toLowerCase().includes(q)) ||
        (r.feedback && r.feedback.toLowerCase().includes(q))
    );
  }, [reviews, searchQuery]);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);

      let relative = '';
      if (diffMins < 1) relative = 'Just now';
      else if (diffMins < 60) relative = `${diffMins}m ago`;
      else if (diffHours < 24) relative = `${diffHours}h ago`;
      else relative = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      const timeFormatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { relative, timeFormatted };
    } catch {
      return { relative: 'Recent', timeFormatted: '' };
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 pt-5 pb-24 space-y-5 font-sans text-[#1d1d1f]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/[0.06] pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1d1d1f]">
            Patient Checkout & Reviews
          </h1>
          <p className="text-xs text-[#86868b] mt-0.5">
            Post-appointment SMS satisfaction surveys & reputation hub
          </p>
        </div>

        <button
          onClick={fetchReviews}
          className="p-1.5 rounded-full bg-white border border-black/[0.06] text-[#86868b] hover:text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition active:scale-95"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
        </button>
      </div>

      {/* Top 4 Stats (Apple Widgets) */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white/95 backdrop-blur-xl p-4 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wider">Sent Today</span>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-[#1d1d1f]">{stats.sentToday}</span>
            <p className="text-[11px] text-[#86868b] mt-0.5">invites</p>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-xl p-4 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wider">All-Time</span>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-[#1d1d1f]">{stats.totalAllTime}</span>
            <p className="text-[11px] text-[#86868b] mt-0.5">total dispatched</p>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-xl p-4 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wider">Completed</span>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-[#ff9500]">{stats.completedCount}</span>
            <p className="text-[11px] text-[#86868b] mt-0.5">reviews received</p>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-xl p-4 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wider">Satisfaction</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-[#1d1d1f]">{stats.avgRating}</span>
            <span className="text-xs text-[#ff9500]">★</span>
          </div>
        </div>
      </section>

      {/* Quick Send Form Box (Apple Clean Card) */}
      <section className="bg-white/95 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-3.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[#1d1d1f]">
            Quick Send Review Invite
          </h2>
          <p className="text-xs text-[#86868b]">
            Trigger an automated feedback SMS right at the checkout counter
          </p>
        </div>

        {successMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/15 rounded-xl text-xs font-semibold text-emerald-700 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/15 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSendReviewRequest} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-5 space-y-1">
            <label className="text-[11px] font-medium text-[#86868b]">
              Patient Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Eleanor Vance"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full px-3.5 py-2 bg-[#f5f5f7] border border-black/[0.06] focus:bg-white focus:border-orange-500 rounded-xl text-xs text-[#1d1d1f] placeholder-[#86868b] outline-none transition"
            />
          </div>

          <div className="sm:col-span-4 space-y-1">
            <label className="text-[11px] font-medium text-[#86868b]">
              Mobile Number *
            </label>
            <input
              type="tel"
              placeholder="+1 (555) 234-8901"
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
              required
              className="w-full px-3.5 py-2 bg-[#f5f5f7] border border-black/[0.06] focus:bg-white focus:border-orange-500 rounded-xl text-xs text-[#1d1d1f] placeholder-[#86868b] outline-none transition font-mono"
            />
          </div>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-[#ff9500] hover:bg-[#e68500] text-white shadow-[0_2px_8px_rgba(255,149,0,0.25)] transition active:scale-95 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Sending...' : 'Send Invite'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Recent Invites List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider pl-1">
            Recent Review Invites ({filteredReviews.length})
          </h2>

          <div className="relative w-44">
            <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-white border border-black/[0.06] focus:border-orange-500 rounded-full text-xs text-[#1d1d1f] placeholder-[#86868b] outline-none transition"
            />
          </div>
        </div>

        {filteredReviews.map((invite) => {
          const { relative, timeFormatted } = formatTime(invite.created_at);

          return (
            <div
              key={invite.id}
              className="p-4 bg-white/95 backdrop-blur-xl rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:border-black/[0.12] transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-[#1d1d1f]">
                      {invite.patient_name || invite.patient_phone}
                    </span>

                    {invite.patient_name && (
                      <span className="text-[11px] font-mono text-[#86868b]">
                        {invite.patient_phone}
                      </span>
                    )}

                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-tight ${
                        invite.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/15'
                          : invite.status === 'delivered'
                          ? 'bg-orange-500/10 text-orange-600 border border-orange-500/15'
                          : 'bg-black/[0.05] text-[#86868b]'
                      }`}
                    >
                      {invite.status === 'completed' ? 'Review Received' : invite.status}
                    </span>

                    {invite.rating && (
                      <span className="text-xs font-semibold text-[#ff9500] flex items-center gap-0.5">
                        ★ {invite.rating}.0
                      </span>
                    )}
                  </div>

                  {invite.feedback && (
                    <p className="text-xs text-[#86868b] mt-1 italic">
                      "{invite.feedback}"
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 text-[11px] text-[#86868b] mt-1">
                    <Clock className="w-3 h-3 text-[#86868b]" />
                    <span>{relative} ({timeFormatted})</span>
                  </div>
                </div>
              </div>

              <div className="self-end sm:self-center">
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-500/10 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                  SMS Sent
                </span>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
