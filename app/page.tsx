'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, CallRecord, CallType, CallStatus } from '@/lib/supabase';
import {
  PhoneIncoming,
  PhoneMissed,
  Voicemail,
  Clock,
  Sparkles,
  PhoneCall,
  Check,
  PlusCircle,
  RefreshCw,
  Search,
  Timer,
  ShieldCheck,
  AlertCircle,
  Volume2,
  BarChart3,
  Calendar,
  Radio,
  SlidersHorizontal,
  ChevronRight,
  User,
  ArrowUpRight
} from 'lucide-react';

const MOCK_CALLS: CallRecord[] = [
  {
    id: 'call-1',
    caller_number: '+1 (555) 234-8901',
    patient_name: 'Eleanor Vance',
    call_type: 'voicemail',
    status: 'callback_needed',
    duration: 48,
    recording_url: 'https://actions.google.com/sounds/v1/emergency/ambulance_siren.ogg',
    summary: 'Patient reports mild post-operative swelling and low-grade fever following Tuesday knee arthroscopy. Requests prompt physician callback regarding antibiotic adjustment.',
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    urgency: 'high',
  },
  {
    id: 'call-2',
    caller_number: '+1 (555) 876-5432',
    patient_name: 'Marcus Brody',
    call_type: 'missed',
    status: 'callback_needed',
    duration: 0,
    recording_url: null,
    summary: 'Missed triage call after 5 rings. Patient has an upcoming cardiology stress test scheduled for Thursday morning.',
    created_at: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    urgency: 'medium',
  },
  {
    id: 'call-3',
    caller_number: '+1 (555) 432-1098',
    patient_name: 'Sarah Jenkins',
    call_type: 'answered',
    status: 'resolved',
    duration: 182,
    recording_url: null,
    summary: 'Routine prescription refill inquiry for Lisinopril 20mg. Refill request electronically routed to CVS Pharmacy #402. Patient confirmed dosage instructions.',
    created_at: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
    urgency: 'low',
  },
  {
    id: 'call-4',
    caller_number: '+1 (555) 901-7744',
    patient_name: 'David Chen',
    call_type: 'answered',
    status: 'resolved',
    duration: 245,
    recording_url: null,
    summary: 'Insurance pre-authorization inquiry for shoulder MRI scan. Staff verified in-network diagnostic imaging center.',
    created_at: new Date(Date.now() - 1000 * 60 * 190).toISOString(),
    urgency: 'low',
  },
  {
    id: 'call-5',
    caller_number: '+1 (555) 312-6688',
    patient_name: 'Clara Oswald',
    call_type: 'answered',
    status: 'resolved',
    duration: 135,
    recording_url: null,
    summary: 'Appointment rescheduled to next Tuesday at 2:15 PM with Dr. Miller. Confirmation SMS sent to mobile.',
    created_at: new Date(Date.now() - 1000 * 60 * 280).toISOString(),
    urgency: 'low',
  },
];

export default function DoctorFeed() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'voicemail' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [showSimulateModal, setShowSimulateModal] = useState<boolean>(false);

  const isSupabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id') &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder.supabase.co')
  );

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    if (!isSupabaseConfigured) {
      setCalls(MOCK_CALLS);
      setIsDemoMode(true);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Could not fetch calls table:', error.message);
        setCalls(MOCK_CALLS);
        setIsDemoMode(true);
      } else if (data && data.length > 0) {
        setCalls(data as CallRecord[]);
        setIsDemoMode(false);
      } else {
        setCalls(MOCK_CALLS);
        setIsDemoMode(true);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setCalls(MOCK_CALLS);
      setIsDemoMode(true);
    } finally {
      setLoading(false);
    }
  }, [isSupabaseConfigured]);

  useEffect(() => {
    fetchCalls();

    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('calls-wide-apple-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRecord = payload.new as CallRecord;
            setCalls((prev) => [newRecord, ...prev.filter((c) => c.id !== newRecord.id)]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedRecord = payload.new as CallRecord;
            setCalls((prev) =>
              prev.map((c) => (c.id === updatedRecord.id ? updatedRecord : c))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setCalls((prev) => prev.filter((c) => c.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCalls, isSupabaseConfigured]);

  const toggleStatus = async (id: string, current: string) => {
    const nextStatus: CallStatus =
      current === 'pending' || current === 'callback_needed' ? 'resolved' : 'pending';

    setUpdatingId(id);

    setCalls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: nextStatus } : c))
    );

    if (isSupabaseConfigured && !isDemoMode) {
      try {
        await supabase.from('calls').update({ status: nextStatus }).eq('id', id);
      } catch (err) {
        console.error('Error updating status:', err);
      }
    }

    setUpdatingId(null);
  };

  const handleSimulateCall = async (type: CallType = 'voicemail') => {
    const sampleNumbers = [
      '+1 (555) 912-3401',
      '+1 (555) 843-2219',
      '+1 (555) 329-8742',
      '+1 (555) 604-9812',
    ];
    const samplePatients = ['Eleanor Vance', 'Arthur Pendelton', 'Sophia Lin', 'James Wilson'];
    const sampleSummaries: Record<CallType, string[]> = {
      voicemail: [
        'Caller requesting urgent lab results for yesterday blood panel. Mentioned persistent fatigue.',
        'Patient asking for Dr. Miller callback regarding preoperative clearance instructions.',
      ],
      missed: [
        'Inbound triage line disconnected after 4 rings. Patient phone identified in system records.',
        'Incoming line missed during morning clinic briefing. Callback recommended.',
      ],
      answered: [
        'Patient confirmed appointment rescheduled to Thursday at 10:30 AM with Dr. Reynolds.',
        'Routine insurance verification completed for upcoming MRI scan authorization.',
      ],
    };

    const summaries = sampleSummaries[type];
    const randomSummary = summaries[Math.floor(Math.random() * summaries.length)];
    const randomPhone = sampleNumbers[Math.floor(Math.random() * sampleNumbers.length)];
    const randomPatient = samplePatients[Math.floor(Math.random() * samplePatients.length)];

    const newCall: CallRecord = {
      id: 'call-' + Math.random().toString(36).substring(2, 9),
      caller_number: randomPhone,
      patient_name: randomPatient,
      call_type: type,
      status: type === 'answered' ? 'resolved' : 'callback_needed',
      duration: type === 'missed' ? 0 : Math.floor(Math.random() * 120) + 30,
      recording_url:
        type === 'voicemail'
          ? 'https://actions.google.com/sounds/v1/emergency/ambulance_siren.ogg'
          : null,
      summary: randomSummary,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured && !isDemoMode) {
      const { error } = await supabase.from('calls').insert([newCall]);
      if (error) setCalls((prev) => [newCall, ...prev]);
    } else {
      setCalls((prev) => [newCall, ...prev]);
    }
    setShowSimulateModal(false);
  };

  // Analytics Engine
  const stats = useMemo(() => {
    const total = calls.length;
    if (total === 0) {
      return {
        total: 0,
        answered: 0,
        missed: 0,
        answerRate: 0,
        avgDuration: '0m 00s',
        pendingCount: 0,
        peakHourFormatted: 'N/A',
        hourlyDistribution: [] as { hour: number; label: string; count: number; percentage: number }[],
      };
    }

    const answered = calls.filter((c) => c.call_type === 'answered');
    const missed = calls.filter((c) => c.call_type === 'missed' || c.call_type === 'voicemail').length;
    const pendingCount = calls.filter((c) => c.status !== 'resolved').length;
    const rate = Math.round((answered.length / total) * 100);

    const totalSecs = answered.reduce((acc, c) => acc + (c.duration || 0), 0);
    const avgSecs = answered.length ? Math.round(totalSecs / answered.length) : 0;
    const mins = Math.floor(avgSecs / 60);
    const secs = avgSecs % 60;
    const avgDuration = `${mins}m ${secs.toString().padStart(2, '0')}s`;

    // Hourly Distribution for 8 AM - 5 PM
    const hourCounts: { [key: number]: number } = {};
    calls.forEach((c) => {
      const h = new Date(c.created_at).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });

    let maxHour = -1;
    let maxCount = 0;
    Object.entries(hourCounts).forEach(([hStr, count]) => {
      const h = parseInt(hStr, 10);
      if (count > maxCount) {
        maxCount = count;
        maxHour = h;
      }
    });

    const formatHour = (h: number) => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const formatted = h % 12 || 12;
      return `${formatted}:00 ${ampm}`;
    };

    const peakHourFormatted =
      maxHour !== -1 ? `${formatHour(maxHour)} - ${formatHour((maxHour + 1) % 24)}` : 'N/A';

    const operatingHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    const maxOperatingCount = Math.max(...operatingHours.map((h) => hourCounts[h] || 0), 1);

    const hourlyDistribution = operatingHours.map((hour) => {
      const count = hourCounts[hour] || 0;
      const label = `${hour % 12 || 12}${hour >= 12 ? 'p' : 'a'}`;
      const percentage = Math.round((count / maxOperatingCount) * 100);
      return { hour, label, count, percentage };
    });

    return {
      total,
      answered: answered.length,
      missed,
      answerRate: rate,
      avgDuration,
      pendingCount,
      peakHourFormatted,
      hourlyDistribution,
    };
  }, [calls]);

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      if (filter === 'pending' && call.status === 'resolved') return false;
      if (filter === 'voicemail' && call.call_type !== 'voicemail') return false;
      if (filter === 'resolved' && call.status !== 'resolved') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNumber = call.caller_number?.toLowerCase().includes(q);
        const matchesSummary = call.summary?.toLowerCase().includes(q);
        const matchesPatient = call.patient_name?.toLowerCase().includes(q);
        return matchesNumber || matchesSummary || matchesPatient;
      }

      return true;
    });
  }, [calls, filter, searchQuery]);

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#18181b] font-sans pb-24">
      {/* Spacious 7XL Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#18181b]">
              Inbound Call Triage Console
            </h1>
            <p className="text-xs text-[#71717a] mt-1 font-normal">
              Real-time patient telephony stream, clinical intake summaries & callback management
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-medium text-[#71717a]">
                {isDemoMode ? 'Live Interactive Preview' : 'Supabase Live Connected'}
              </span>
            </div>

            <button
              onClick={() => setShowSimulateModal(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-full bg-orange-600 hover:bg-orange-700 text-white shadow-[0_2px_8px_rgba(234,88,12,0.22)] transition active:scale-98"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Simulate Call</span>
            </button>

            <button
              onClick={fetchCalls}
              className="p-2 rounded-full bg-white border border-black/[0.06] text-[#71717a] hover:text-[#18181b] shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition active:scale-95"
              title="Refresh Stream"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* 4 Wide Metric Summary Tiles */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
            <span className="text-xs font-medium text-[#71717a]">
              Today's Inbound
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight text-[#18181b]">
                {stats.total}
              </span>
              <span className="text-xs text-[#71717a]">
                {stats.missed} missed
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
            <span className="text-xs font-medium text-[#71717a]">
              Answer Rate
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight text-orange-600">
                {stats.answerRate}%
              </span>
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50">
                Healthy
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
            <span className="text-xs font-medium text-[#71717a]">
              Avg Handle Time
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tracking-tight text-[#18181b]">
                {stats.avgDuration}
              </span>
              <span className="text-xs text-[#71717a]">
                answered
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
            <span className="text-xs font-medium text-[#71717a]">
              Callbacks Needed
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight text-[#18181b]">
                {stats.pendingCount}
              </span>
              <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/50">
                Action Req.
              </span>
            </div>
          </div>
        </section>

        {/* Desktop 2-Column Split: Stream (8 Cols) vs Live Operations (4 Cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Feed Column (8 Cols) */}
          <section className="lg:col-span-8 space-y-4">
            {/* Filter Pills & Search */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pb-1">
              <div className="flex items-center bg-black/[0.04] p-1 rounded-full text-xs font-medium border border-black/[0.03]">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                    filter === 'all'
                      ? 'bg-white text-[#18181b] shadow-[0_1px_4px_rgba(0,0,0,0.06)] font-semibold'
                      : 'text-[#71717a] hover:text-[#18181b]'
                  }`}
                >
                  All Calls ({calls.length})
                </button>
                <button
                  onClick={() => setFilter('pending')}
                  className={`px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                    filter === 'pending'
                      ? 'bg-white text-orange-600 shadow-[0_1px_4px_rgba(0,0,0,0.06)] font-semibold'
                      : 'text-[#71717a] hover:text-[#18181b]'
                  }`}
                >
                  Pending Callback ({stats.pendingCount})
                </button>
                <button
                  onClick={() => setFilter('voicemail')}
                  className={`px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                    filter === 'voicemail'
                      ? 'bg-white text-rose-600 shadow-[0_1px_4px_rgba(0,0,0,0.06)] font-semibold'
                      : 'text-[#71717a] hover:text-[#18181b]'
                  }`}
                >
                  Voicemails ({calls.filter((c) => c.call_type === 'voicemail').length})
                </button>
                <button
                  onClick={() => setFilter('resolved')}
                  className={`px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                    filter === 'resolved'
                      ? 'bg-white text-emerald-700 shadow-[0_1px_4px_rgba(0,0,0,0.06)] font-semibold'
                      : 'text-[#71717a] hover:text-[#18181b]'
                  }`}
                >
                  Resolved
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-[#71717a] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter by phone or patient..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-black/[0.06] focus:border-orange-500 rounded-full text-xs text-[#18181b] placeholder-[#71717a] outline-none shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition"
                />
              </div>
            </div>

            {/* List of Calls */}
            <div className="space-y-3.5">
              {filteredCalls.map((call) => {
                const isResolved = call.status === 'resolved';

                return (
                  <div
                    key={call.id}
                    className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:border-black/[0.12] transition-all duration-200"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            call.call_type === 'voicemail'
                              ? 'bg-rose-50 text-rose-600 border border-rose-100'
                              : call.call_type === 'missed'
                              ? 'bg-amber-50 text-amber-600 border border-amber-100'
                              : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          }`}
                        >
                          {call.call_type === 'voicemail' && <Voicemail className="w-4.5 h-4.5" />}
                          {call.call_type === 'missed' && <PhoneMissed className="w-4.5 h-4.5" />}
                          {call.call_type === 'answered' && <PhoneIncoming className="w-4.5 h-4.5" />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-semibold text-sm text-[#18181b] tracking-tight">
                              {call.patient_name || call.caller_number}
                            </span>
                            {call.patient_name && (
                              <span className="text-xs font-mono text-[#71717a]">
                                {call.caller_number}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-[#71717a] mt-0.5">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#a1a1aa]" />
                              {new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {call.duration ? (
                              <span>• {Math.floor(call.duration / 60)}m {call.duration % 60}s</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize ${
                            call.call_type === 'voicemail'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              : call.call_type === 'missed'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              call.call_type === 'voicemail'
                                ? 'bg-rose-500'
                                : call.call_type === 'missed'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                          />
                          {call.call_type}
                        </span>

                        {isResolved ? (
                          <button
                            onClick={() => toggleStatus(call.id, call.status)}
                            disabled={updatingId === call.id}
                            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-[#f4f4f5] hover:bg-[#e4e4e7] text-[#27272a] border border-[#e4e4e7] transition active:scale-98"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                            <span>Resolved</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleStatus(call.id, call.status)}
                            disabled={updatingId === call.id}
                            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white shadow-[0_1px_4px_rgba(234,88,12,0.2)] transition active:scale-98"
                          >
                            <span>Mark Resolved</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* AI Clinical Summary (Refined warm container) */}
                    {call.summary && (
                      <div className="bg-[#fffbf6] border border-orange-200/50 rounded-xl p-3.5 mt-2.5 text-xs text-[#27272a]">
                        <div className="flex items-center gap-1.5 mb-1 text-orange-700 font-medium">
                          <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                          <span className="text-[11px] uppercase tracking-wider">AI Clinical Summary</span>
                        </div>
                        <p className="leading-relaxed font-normal">
                          {call.summary}
                        </p>
                      </div>
                    )}

                    {/* Audio Player */}
                    {call.recording_url && (
                      <div className="mt-3 bg-black/[0.02] p-2.5 rounded-xl border border-black/[0.04]">
                        <div className="flex items-center gap-2 mb-1.5 text-[11px] font-medium text-[#71717a]">
                          <Volume2 className="w-3.5 h-3.5 text-orange-600" />
                          <span>Voicemail Playback</span>
                        </div>
                        <audio controls className="w-full h-8 outline-none">
                          <source src={call.recording_url} type="audio/mpeg" />
                          <source src={call.recording_url} type="audio/ogg" />
                          Audio playback not supported.
                        </audio>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredCalls.length === 0 && (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/[0.08]">
                  <p className="text-sm font-medium text-[#71717a]">No calls matching this filter.</p>
                </div>
              )}
            </div>
          </section>

          {/* Right Sidebar Operations Column (4 Cols) */}
          <aside className="lg:col-span-4 space-y-5">
            {/* Hourly Distribution Sparkline Widget */}
            <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-3">
              <div className="flex items-center justify-between border-b border-black/[0.05] pb-2.5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-orange-600" />
                  <span className="text-xs font-semibold text-[#18181b]">
                    Hourly Intake Traffic
                  </span>
                </div>
                <span className="text-[11px] text-[#71717a]">
                  Peak: {stats.peakHourFormatted}
                </span>
              </div>

              <div className="grid grid-cols-10 gap-1.5 pt-2">
                {stats.hourlyDistribution.map((item) => (
                  <div key={item.hour} className="flex flex-col items-center gap-1 group">
                    <div className="w-full bg-[#f4f4f5] rounded-md h-16 flex flex-col justify-end p-0.5 relative overflow-hidden">
                      <div
                        className={`w-full rounded transition-all duration-300 ${
                          item.count > 0 ? 'bg-orange-600 group-hover:bg-orange-700' : 'bg-transparent'
                        }`}
                        style={{ height: `${Math.max(item.percentage, item.count > 0 ? 18 : 0)}%` }}
                      />
                      {item.count > 0 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#18181b] group-hover:text-white pointer-events-none">
                          {item.count}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-[#71717a]">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Clinic Operations & EMR Sync Status */}
            <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-3">
              <h3 className="text-xs font-semibold text-[#18181b] uppercase tracking-wider">
                System Telemetry
              </h3>

              <div className="space-y-2.5 text-xs text-[#71717a]">
                <div className="flex justify-between items-center py-1 border-b border-black/[0.03]">
                  <span>Telephony Provider</span>
                  <span className="font-medium text-[#18181b]">OpenPhone / Quo VoIP</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-black/[0.03]">
                  <span>Webhook Endpoint</span>
                  <code className="font-mono text-[11px] bg-[#f4f4f5] px-1.5 py-0.5 rounded text-[#27272a]">/api/webhook</code>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-black/[0.03]">
                  <span>Realtime Engine</span>
                  <span className="text-emerald-700 font-medium">Postgres Channel Active</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span>AI Triage Processing</span>
                  <span className="font-medium text-[#18181b]">Automated EMR Summaries</span>
                </div>
              </div>
            </div>

            {/* Quick Test Inbound Generator */}
            <div className="bg-[#fffbf6] border border-orange-200/60 p-5 rounded-2xl shadow-xs space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-[#18181b]">
                  Test Inbound Simulator
                </h4>
                <p className="text-[11px] text-[#71717a] mt-0.5">
                  Simulate live triage events to verify realtime dashboard response
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  onClick={() => handleSimulateCall('voicemail')}
                  className="w-full text-left p-2.5 rounded-xl border border-rose-200/70 bg-white hover:bg-rose-50/50 text-xs font-medium text-rose-800 transition flex items-center justify-between"
                >
                  <span>Post-Op Voicemail (+Audio)</span>
                  <ChevronRight className="w-3.5 h-3.5 text-rose-400" />
                </button>
                <button
                  onClick={() => handleSimulateCall('missed')}
                  className="w-full text-left p-2.5 rounded-xl border border-amber-200/70 bg-white hover:bg-amber-50/50 text-xs font-medium text-amber-800 transition flex items-center justify-between"
                >
                  <span>Missed Patient Line</span>
                  <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
                </button>
                <button
                  onClick={() => handleSimulateCall('answered')}
                  className="w-full text-left p-2.5 rounded-xl border border-emerald-200/70 bg-white hover:bg-emerald-50/50 text-xs font-medium text-emerald-800 transition flex items-center justify-between"
                >
                  <span>Answered Routine Refill</span>
                  <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Simulator Modal */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-black/[0.08] rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-[0_12px_40px_rgba(0,0,0,0.1)]">
            <div className="flex justify-between items-center border-b border-black/[0.05] pb-3">
              <h3 className="text-sm font-semibold text-[#18181b]">Simulate Inbound Call</h3>
              <button
                onClick={() => setShowSimulateModal(false)}
                className="w-7 h-7 rounded-full bg-black/[0.04] hover:bg-black/[0.08] flex items-center justify-center text-[#71717a] text-xs font-bold transition"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#71717a]">
              Trigger an incoming telephony webhook event to test live triage and audio:
            </p>
            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleSimulateCall('voicemail')}
                className="w-full text-left p-3 rounded-xl border border-rose-200/60 bg-rose-50/50 hover:bg-rose-50 text-xs font-semibold text-rose-800 transition"
              >
                Urgent Post-Op Voicemail (+Audio)
              </button>
              <button
                onClick={() => handleSimulateCall('missed')}
                className="w-full text-left p-3 rounded-xl border border-amber-200/60 bg-amber-50/50 hover:bg-amber-50 text-xs font-semibold text-amber-800 transition"
              >
                Missed Triage Line
              </button>
              <button
                onClick={() => handleSimulateCall('answered')}
                className="w-full text-left p-3 rounded-xl border border-emerald-200/60 bg-emerald-50/50 hover:bg-emerald-50 text-xs font-semibold text-emerald-800 transition"
              >
                Answered Routine Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
