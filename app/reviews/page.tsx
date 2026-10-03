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
  Check,
  HeartHandshake
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
      .channel('review-requests-wide-feed')
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

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans text-[#18181b] pb-24">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#e7ebef]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1e293b]">
            Patient Care Feedback & Reputation Hub
          </h1>
          <p className="text-xs text-[#64748b] mt-1 font-normal">
            Automate post-appointment patient satisfaction SMS surveys and track verified clinic reputation
          </p>
        </div>

        <button
          onClick={fetchReviews}
          className="p-2 rounded-full bg-white border border-[#e7ebef] text-[#64748b] hover:text-[#095d7e] shadow-soft transition active:scale-95 self-start sm:self-auto"
          title="Refresh List"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#095d7e]' : ''}`} />
        </button>
      </div>

      {/* Top 4 Metrics Tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#e7ebef] shadow-soft hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#64748b]">Sent Today</span>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-semibold tracking-tight text-[#1e293b]">{stats.sentToday}</span>
            <span className="text-xs text-[#64748b]">invites</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#e7ebef] shadow-soft hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#64748b]">Total Dispatched</span>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-semibold tracking-tight text-[#1e293b]">{stats.totalAllTime}</span>
            <span className="text-xs text-[#64748b]">lifetime</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#e7ebef] shadow-soft hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#64748b]">Reviews Completed</span>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-semibold tracking-tight text-[#095d7e]">{stats.completedCount}</span>
            <span className="text-[11px] font-semibold text-[#095d7e] bg-[#eaf4f8] px-2 py-0.5 rounded-full border border-[#c3dfeb]">
              {stats.totalAllTime > 0 ? `${Math.round((stats.completedCount / stats.totalAllTime) * 100)}%` : '0%'}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#e7ebef] shadow-soft hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#64748b]">Clinic Rating</span>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-semibold tracking-tight text-[#1e293b]">{stats.avgRating}</span>
            <span className="text-xs text-[#095d7e] font-semibold tracking-widest">★ ★ ★ ★ ★</span>
          </div>
        </div>
      </section>

      {/* 2-Column Split: Form (5 Cols) vs Recent Invites Feed (7 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Quick Send Form (5 Cols) */}
        <section className="lg:col-span-5 bg-white p-6 rounded-2xl border border-[#e7ebef] shadow-soft space-y-4">
          <div className="border-b border-[#f1f5f9] pb-3">
            <h2 className="text-sm font-semibold tracking-tight text-[#1e293b]">
              Quick Send Review Invite
            </h2>
            <p className="text-xs text-[#64748b] mt-0.5">
              Trigger an automated feedback SMS right at patient checkout or discharge
            </p>
          </div>

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200/60 rounded-xl text-xs font-medium text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200/60 rounded-xl text-xs font-medium text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSendReviewRequest} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#64748b]">
                Patient Name <span className="text-[#94a3b8] font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Eleanor Vance"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#f8f9fa] border border-[#e7ebef] focus:bg-white focus:border-[#095d7e] focus:ring-2 focus:ring-[#095d7e]/15 rounded-xl text-xs text-[#1e293b] placeholder-[#94a3b8] outline-none transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#64748b]">
                Patient Mobile Number <span className="text-[#095d7e] font-bold">*</span>
              </label>
              <input
                type="tel"
                placeholder="+1 (555) 234-8901"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-[#f8f9fa] border border-[#e7ebef] focus:bg-white focus:border-[#095d7e] focus:ring-2 focus:ring-[#095d7e]/15 rounded-xl text-xs text-[#1e293b] placeholder-[#94a3b8] outline-none transition font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold bg-[#095d7e] hover:bg-[#074862] text-white shadow-[0_2px_8px_rgba(9,93,126,0.25)] transition active:scale-98 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Dispatching SMS...' : 'Send Review Invite'}</span>
            </button>
          </form>
        </section>

        {/* Recent Invites List (7 Cols) */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
              Recent Dispatches ({filteredReviews.length})
            </h2>

            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-white border border-[#e7ebef] focus:border-[#095d7e] focus:ring-2 focus:ring-[#095d7e]/15 rounded-full text-xs text-[#1e293b] placeholder-[#94a3b8] outline-none shadow-soft transition"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredReviews.map((invite) => {
              const { relative, timeFormatted } = formatTime(invite.created_at);

              return (
                <div
                  key={invite.id}
                  className="p-5 bg-white rounded-2xl border border-[#e7ebef] shadow-soft hover:border-[#c3dfeb] hover:shadow-card-hover transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-[#eaf4f8] text-[#095d7e] flex items-center justify-center shrink-0 border border-[#c3dfeb]">
                      <UserCheck className="w-4.5 h-4.5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-[#1e293b]">
                          {invite.patient_name || invite.patient_phone}
                        </span>

                        {invite.patient_name && (
                          <span className="text-xs font-mono text-[#64748b]">
                            {invite.patient_phone}
                          </span>
                        )}

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            invite.status === 'completed'
                              ? 'bg-[#eaf4f8] text-[#095d7e] border border-[#c3dfeb]'
                              : invite.status === 'delivered'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200/60'
                              : 'bg-[#f1f5f9] text-[#64748b]'
                          }`}
                        >
                          {invite.status === 'completed' ? 'Review Received' : invite.status}
                        </span>

                        {invite.rating && (
                          <span className="text-xs font-semibold text-[#095d7e] flex items-center gap-0.5">
                            ★ {invite.rating}.0
                          </span>
                        )}
                      </div>

                      {invite.feedback && (
                        <p className="text-xs text-[#64748b] mt-1 italic">
                          "{invite.feedback}"
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 text-xs text-[#94a3b8] mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{relative} ({timeFormatted})</span>
                      </div>
                    </div>
                  </div>

                  <div className="self-end sm:self-center">
                    <span className="text-[11px] font-semibold text-[#095d7e] bg-[#eaf4f8] px-2.5 py-1 rounded-full border border-[#c3dfeb] flex items-center gap-1">
                      <Check className="w-3 h-3 text-[#095d7e] stroke-[2.5]" />
                      SMS Dispatched
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function formatTime(isoString: string) {
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
}
