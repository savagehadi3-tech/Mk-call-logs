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
  Volume2
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
    summary: 'Patient reports mild post-op swelling and low-grade fever following Tuesday knee arthroscopy. Requests physician callback regarding antibiotic dosage.',
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
    summary: 'Routine prescription refill inquiry for Lisinopril 20mg. Refill electronically transmitted to CVS Pharmacy #402. Patient confirmed dosage instructions.',
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
    summary: 'Appointment rescheduled to next Tuesday at 2:15 PM with Dr. Miller. Confirmation SMS sent to patient mobile.',
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
        console.warn('Could not fetch from Supabase calls table:', error.message);
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
      .channel('calls-apple-feed')
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

  const stats = useMemo(() => {
    const total = calls.length;
    if (total === 0) {
      return { total: 0, answered: 0, missed: 0, answerRate: 0, avgDuration: '0m 00s', pendingCount: 0 };
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

    return { total, answered: answered.length, missed, answerRate: rate, avgDuration, pendingCount };
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
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans pb-24">
      <main className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-medium text-[#86868b]">
              {isDemoMode ? 'Live Interactive Desk' : 'Supabase Telephony Live'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSimulateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-[#ff9500] hover:bg-[#e68500] text-white shadow-[0_2px_8px_rgba(255,149,0,0.25)] transition active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Simulate Call</span>
            </button>

            <button
              onClick={fetchCalls}
              className="p-1.5 rounded-full bg-white border border-black/[0.06] text-[#86868b] hover:text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition active:scale-95"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Apple iOS 4-Card Widget Grid (Pure White, Orange Accents) */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Card 1: Today Inbound */}
          <div className="bg-white/95 backdrop-blur-xl p-4 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#86868b] mb-1">
              <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wider">
                Inbound
              </span>
              <div className="w-6 h-6 rounded-lg bg-orange-500/10 text-[#ff9500] flex items-center justify-center">
                <PhoneCall className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold tracking-tight text-[#1d1d1f]">
                {stats.total}
              </span>
              <span className="text-xs text-[#86868b] font-normal">calls</span>
            </div>
          </div>

          {/* Card 2: Live Answer Rate */}
          <div className="bg-white/95 backdrop-blur-xl p-4 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#86868b] mb-1">
              <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wider">
                Answer Rate
              </span>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold tracking-tight text-[#ff9500]">
                {stats.answerRate}%
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                live
              </span>
            </div>
          </div>

          {/* Card 3: Avg Duration */}
          <div className="bg-white/95 backdrop-blur-xl p-4 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#86868b] mb-1">
              <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wider">
                Avg Length
              </span>
              <div className="w-6 h-6 rounded-lg bg-orange-500/10 text-[#ff9500] flex items-center justify-center">
                <Timer className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1">
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f]">
                {stats.avgDuration}
              </span>
            </div>
          </div>

          {/* Card 4: Action Needed */}
          <div className="bg-white/95 backdrop-blur-xl p-4 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#86868b] mb-1">
              <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wider">
                Action Req.
              </span>
              <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold tracking-tight text-[#1d1d1f]">
                {stats.pendingCount}
              </span>
              <span className="text-xs text-[#86868b] font-normal">pending</span>
            </div>
          </div>
        </section>

        {/* Apple iOS Filter Segmented Control & Search */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between pt-1">
          <div className="flex items-center bg-black/[0.05] p-1 rounded-full text-xs font-medium self-start sm:self-auto">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-full transition-all duration-200 ${
                filter === 'all'
                  ? 'bg-white text-[#1d1d1f] shadow-[0_1px_4px_rgba(0,0,0,0.08)] font-semibold'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              All ({calls.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1 rounded-full transition-all duration-200 ${
                filter === 'pending'
                  ? 'bg-white text-orange-600 shadow-[0_1px_4px_rgba(0,0,0,0.08)] font-semibold'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              Pending ({stats.pendingCount})
            </button>
            <button
              onClick={() => setFilter('voicemail')}
              className={`px-3 py-1 rounded-full transition-all duration-200 ${
                filter === 'voicemail'
                  ? 'bg-white text-rose-600 shadow-[0_1px_4px_rgba(0,0,0,0.08)] font-semibold'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              Voicemails ({calls.filter((c) => c.call_type === 'voicemail').length})
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-3 py-1 rounded-full transition-all duration-200 ${
                filter === 'resolved'
                  ? 'bg-white text-emerald-600 shadow-[0_1px_4px_rgba(0,0,0,0.08)] font-semibold'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              Resolved
            </button>
          </div>

          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search patient, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-black/[0.06] focus:border-orange-500 rounded-full text-xs text-[#1d1d1f] placeholder-[#86868b] outline-none shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition"
            />
          </div>
        </div>

        {/* Call Cards Feed (Apple iOS Card Feel) */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider pl-1">
            Patient Activity ({filteredCalls.length})
          </h2>

          {filteredCalls.map((call) => {
            const isResolved = call.status === 'resolved';

            return (
              <div
                key={call.id}
                className="bg-white/95 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:border-black/[0.12] transition-all duration-200"
              >
                <div className="flex justify-between items-start mb-2.5 gap-2">
                  <div className="flex items-center gap-3">
                    {/* Call Type Icon Avatar */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        call.call_type === 'voicemail'
                          ? 'bg-rose-500/10 text-rose-600'
                          : call.call_type === 'missed'
                          ? 'bg-orange-500/10 text-orange-600'
                          : 'bg-emerald-500/10 text-emerald-600'
                      }`}
                    >
                      {call.call_type === 'voicemail' && <Voicemail className="w-4 h-4" />}
                      {call.call_type === 'missed' && <PhoneMissed className="w-4 h-4" />}
                      {call.call_type === 'answered' && <PhoneIncoming className="w-4 h-4" />}
                    </div>

                    <div>
                      <h3 className="font-semibold text-[#1d1d1f] text-sm tracking-tight">
                        {call.patient_name || call.caller_number}
                      </h3>
                      {call.patient_name && (
                        <p className="text-[11px] text-[#86868b] font-mono mt-0.5">
                          {call.caller_number}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Apple iOS Status Pill Badges */}
                  <span
                    className={`text-[11px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full capitalize ${
                      call.call_type === 'voicemail'
                        ? 'bg-rose-500/10 text-rose-600 border border-rose-500/15'
                        : call.call_type === 'missed'
                        ? 'bg-orange-500/10 text-orange-600 border border-orange-500/15'
                        : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/15'
                    }`}
                  >
                    {call.call_type}
                  </span>
                </div>

                {/* AI Summary Bubble (Apple Warm Off-White / Peach Tint) */}
                {call.summary && (
                  <div className="bg-[#fff9f2] border border-orange-200/50 rounded-xl p-3 mb-3">
                    <div className="flex items-center gap-1.5 mb-1 text-orange-700">
                      <Sparkles className="w-3.5 h-3.5 text-[#ff9500]" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider">
                        AI Clinical Summary
                      </span>
                    </div>
                    <p className="text-xs text-[#1d1d1f]/90 leading-relaxed font-normal">
                      {call.summary}
                    </p>
                  </div>
                )}

                {/* HTML5 Audio Player */}
                {call.recording_url && (
                  <div className="mb-3 bg-black/[0.03] p-2.5 rounded-xl border border-black/[0.04]">
                    <div className="flex items-center gap-2 mb-1.5 text-[11px] font-medium text-[#86868b]">
                      <Volume2 className="w-3.5 h-3.5 text-[#ff9500]" />
                      <span>Voicemail Audio Recording</span>
                    </div>
                    <audio controls className="w-full h-8 outline-none">
                      <source src={call.recording_url} type="audio/mpeg" />
                      <source src={call.recording_url} type="audio/ogg" />
                      Audio playback not supported.
                    </audio>
                  </div>
                )}

                {/* Card Footer with Timestamp & Normal Clean Apple Buttons */}
                <div className="flex justify-between items-center text-xs pt-2.5 border-t border-black/[0.05]">
                  <span className="text-[#86868b] text-[11px] font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#86868b]" />
                    {new Date(call.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    {call.duration ? `• ${Math.round(call.duration / 60)} min` : ''}
                  </span>

                  {/* Clean Normal Apple Button */}
                  <div>
                    {isResolved ? (
                      <button
                        onClick={() => toggleStatus(call.id, call.status)}
                        disabled={updatingId === call.id}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-black/[0.05] hover:bg-black/[0.08] text-[#1d1d1f] transition active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                        <span>Resolved ✓</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleStatus(call.id, call.status)}
                        disabled={updatingId === call.id}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#ff9500] hover:bg-[#e68500] text-white shadow-[0_2px_8px_rgba(255,149,0,0.25)] transition active:scale-95"
                      >
                        <span>Mark Done</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredCalls.length === 0 && (
            <div className="text-center py-12 bg-white/60 rounded-2xl border border-dashed border-black/[0.08]">
              <p className="text-sm font-medium text-[#86868b]">No calls matching this filter.</p>
            </div>
          )}
        </div>
      </main>

      {/* Simulator Modal */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-2xl border border-black/[0.08] rounded-3xl max-w-sm w-full p-5 space-y-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
            <div className="flex justify-between items-center border-b border-black/[0.06] pb-2.5">
              <h3 className="text-sm font-semibold text-[#1d1d1f]">Simulate Inbound Telephony</h3>
              <button
                onClick={() => setShowSimulateModal(false)}
                className="w-6 h-6 rounded-full bg-black/[0.05] hover:bg-black/[0.1] flex items-center justify-center text-[#86868b] text-xs font-bold transition"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#86868b]">
              Trigger a test incoming patient event to verify live triage, audio playback, and counters:
            </p>
            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleSimulateCall('voicemail')}
                className="w-full text-left p-3 rounded-2xl border border-rose-500/15 bg-rose-500/[0.04] hover:bg-rose-500/[0.08] text-xs font-semibold text-rose-700 transition"
              >
                Urgent Voicemail (with Audio Recording)
              </button>
              <button
                onClick={() => handleSimulateCall('missed')}
                className="w-full text-left p-3 rounded-2xl border border-orange-500/15 bg-orange-500/[0.04] hover:bg-orange-500/[0.08] text-xs font-semibold text-orange-700 transition"
              >
                Missed Patient Line
              </button>
              <button
                onClick={() => handleSimulateCall('answered')}
                className="w-full text-left p-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] text-xs font-semibold text-emerald-700 transition"
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
