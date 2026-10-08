'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, CallRecord, CallStatus } from '@/lib/supabase';
import {
  PhoneIncoming,
  PhoneMissed,
  Voicemail,
  Clock,
  Sparkles,
  PhoneCall,
  PlusCircle,
  RefreshCw,
  Search,
  Timer,
  Download,
  Activity,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Volume2
} from 'lucide-react';

const MOCK_CALLS: CallRecord[] = [
  {
    id: 'call-1',
    caller_number: '+1 (555) 234-8901',
    clinic_number: '+1 (800) 555-0199',
    patient_name: 'Eleanor Vance',
    duration: 48,
    status: 'voicemail',
    recording_url: null,
    voicemail_url: 'https://actions.google.com/sounds/v1/emergency/ambulance_siren.ogg',
    ai_summary: 'Patient reports mild post-operative swelling and low-grade fever following Tuesday knee arthroscopy. Requests prompt physician callback regarding antibiotic adjustment.',
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: 'call-2',
    caller_number: '+1 (555) 876-5432',
    clinic_number: '+1 (800) 555-0199',
    patient_name: 'Marcus Brody',
    duration: 0,
    status: 'missed',
    recording_url: null,
    voicemail_url: null,
    ai_summary: 'Missed triage call after 5 rings. Patient has an upcoming cardiology stress test scheduled for Thursday morning.',
    created_at: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
  },
  {
    id: 'call-3',
    caller_number: '+1 (555) 432-1098',
    clinic_number: '+1 (800) 555-0199',
    patient_name: 'Sarah Jenkins',
    duration: 182,
    status: 'completed',
    recording_url: 'https://actions.google.com/sounds/v1/emergency/ambulance_siren.ogg',
    voicemail_url: null,
    ai_summary: 'Routine prescription refill inquiry for Lisinopril 20mg. Refill request electronically routed to CVS Pharmacy #402. Patient confirmed dosage instructions.',
    created_at: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
  },
  {
    id: 'call-4',
    caller_number: '+1 (555) 901-7744',
    clinic_number: '+1 (800) 555-0199',
    patient_name: 'David Chen',
    duration: 245,
    status: 'completed',
    recording_url: 'https://actions.google.com/sounds/v1/emergency/ambulance_siren.ogg',
    voicemail_url: null,
    ai_summary: 'Insurance pre-authorization inquiry for shoulder MRI scan. Staff verified in-network diagnostic imaging center.',
    created_at: new Date(Date.now() - 1000 * 60 * 190).toISOString(),
  },
  {
    id: 'call-5',
    caller_number: '+1 (555) 312-6688',
    clinic_number: '+1 (800) 555-0199',
    patient_name: 'Clara Oswald',
    duration: 0,
    status: 'missed',
    recording_url: null,
    voicemail_url: null,
    ai_summary: null,
    created_at: new Date(Date.now() - 1000 * 60 * 280).toISOString(),
  },
];

export default function DoctorFeed() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'missed' | 'voicemail'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [showSimulateModal, setShowSimulateModal] = useState<boolean>(false);
  const [expandedSummaryIds, setExpandedSummaryIds] = useState<Set<string>>(new Set());

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
      .channel('openphone-live-calls')
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

  const toggleSummaryExpand = (id: string) => {
    setExpandedSummaryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSimulateCall = async (simType: 'completed' | 'missed' | 'voicemail') => {
    const sampleNumbers = [
      '+1 (555) 912-3401',
      '+1 (555) 843-2219',
      '+1 (555) 329-8742',
      '+1 (555) 604-9812',
    ];
    const samplePatients = ['Eleanor Vance', 'Arthur Pendelton', 'Sophia Lin', 'James Wilson'];
    const sampleSummaries = {
      completed: [
        'Patient confirmed appointment rescheduled to Thursday at 10:30 AM with Dr. Reynolds. Routine pre-op checkup instructions acknowledged.',
        'Routine prescription refill inquiry for Lisinopril 20mg. Request electronically routed to CVS Pharmacy. Patient confirmed dosage instructions.',
      ],
      missed: [
        'Inbound triage line missed after 4 rings. Patient phone identified in system records. Recommended callback regarding upcoming lab test.',
        'Incoming clinic line disconnected before intake agent answered. Callback queued.',
      ],
      voicemail: [
        'Patient reports mild post-operative swelling and low-grade fever following Tuesday knee arthroscopy. Requests prompt physician callback.',
        'Caller requesting urgent lab results for yesterday blood panel. Mentioned persistent fatigue and requested physician review.',
      ],
    };

    const summaries = sampleSummaries[simType];
    const randomSummary = summaries[Math.floor(Math.random() * summaries.length)];
    const randomPhone = sampleNumbers[Math.floor(Math.random() * sampleNumbers.length)];
    const randomPatient = samplePatients[Math.floor(Math.random() * samplePatients.length)];
    const duration = simType === 'missed' ? 0 : Math.floor(Math.random() * 140) + 35;
    const callId = 'call-' + Math.random().toString(36).substring(2, 9);
    const audioSample = 'https://actions.google.com/sounds/v1/emergency/ambulance_siren.ogg';

    const newCall: CallRecord = {
      id: callId,
      caller_number: randomPhone,
      clinic_number: '+1 (800) 555-0199',
      patient_name: randomPatient,
      duration,
      status: simType,
      recording_url: simType === 'completed' ? audioSample : null,
      voicemail_url: simType === 'voicemail' ? audioSample : null,
      ai_summary: randomSummary,
      created_at: new Date().toISOString(),
    };

    // Try posting to OpenPhone webhook route to test end-to-end webhook processing
    try {
      let webhookPayload: any = null;

      if (simType === 'completed') {
        webhookPayload = {
          type: 'call.completed',
          data: {
            id: callId,
            from: randomPhone,
            to: '+1 (800) 555-0199',
            duration,
            recording: { url: audioSample },
            createdAt: newCall.created_at,
          },
        };
      } else if (simType === 'missed') {
        webhookPayload = {
          type: 'call.completed',
          data: {
            id: callId,
            from: randomPhone,
            to: '+1 (800) 555-0199',
            duration: 0,
            createdAt: newCall.created_at,
          },
        };
      } else if (simType === 'voicemail') {
        webhookPayload = {
          type: 'voicemail.completed',
          data: {
            callId,
            mediaUrl: audioSample,
          },
        };
      }

      if (webhookPayload) {
        await fetch('/api/webhooks/openphone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload),
        });
      }
    } catch (e) {
      console.warn('Webhook simulation fetch error (fallback to local state):', e);
    }

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
        completed: 0,
        missed: 0,
        voicemails: 0,
        completionRate: 0,
        avgDuration: '0s',
      };
    }

    const completedCalls = calls.filter((c) => c.status === 'completed');
    const missedCalls = calls.filter((c) => c.status === 'missed');
    const voicemailCalls = calls.filter((c) => c.status === 'voicemail');

    const totalSecs = completedCalls.reduce((acc, c) => acc + (c.duration || 0), 0);
    const avgSecs = completedCalls.length ? Math.round(totalSecs / completedCalls.length) : 0;
    const mins = Math.floor(avgSecs / 60);
    const secs = avgSecs % 60;
    const avgDuration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    const rate = Math.round((completedCalls.length / total) * 100);

    return {
      total,
      completed: completedCalls.length,
      missed: missedCalls.length,
      voicemails: voicemailCalls.length,
      completionRate: rate,
      avgDuration,
    };
  }, [calls]);

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      if (filter !== 'all' && call.status !== filter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesCaller = call.caller_number?.toLowerCase().includes(q);
        const matchesClinic = call.clinic_number?.toLowerCase().includes(q);
        const matchesSummary = call.ai_summary?.toLowerCase().includes(q);
        const matchesPatient = call.patient_name?.toLowerCase().includes(q);
        return matchesCaller || matchesClinic || matchesSummary || matchesPatient;
      }

      return true;
    });
  }, [calls, filter, searchQuery]);

  const formatDuration = (duration?: number | null, status?: CallStatus) => {
    if (status === 'missed') {
      return <span className="text-amber-700 text-xs font-medium">Missed</span>;
    }
    if (!duration || duration <= 0) {
      return <span className="text-[#94a3b8] text-xs">0s</span>;
    }
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    if (mins > 0) {
      return <span className="text-[#1e293b] text-xs font-medium">{`${mins}m ${secs.toString().padStart(2, '0')}s`}</span>;
    }
    return <span className="text-[#1e293b] text-xs font-medium">{`${secs}s`}</span>;
  };

  const formatDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const datePart = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const timePart = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return { datePart, timePart };
    } catch {
      return { datePart: '—', timePart: '' };
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#1e293b] font-sans pb-24">
      {/* Spacious 7XL Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#e7ebef]">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1e293b]">
              OpenPhone Call Logs & AI Triage Hub
            </h1>
            <p className="text-xs text-[#64748b] mt-1 font-normal">
              Live OpenPhone webhook integration with audio recordings, voicemails & clinical AI summaries
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#e7ebef] shadow-soft">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-medium text-[#64748b]">
                {isDemoMode ? 'Interactive Preview' : 'Supabase Live Connected'}
              </span>
            </div>

            <button
              onClick={() => setShowSimulateModal(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full bg-[#095d7e] hover:bg-[#074862] text-white shadow-[0_2px_8px_rgba(9,93,126,0.25)] transition active:scale-98"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Simulate Call</span>
            </button>

            <button
              onClick={fetchCalls}
              className="p-2 rounded-full bg-white border border-[#e7ebef] text-[#64748b] hover:text-[#095d7e] shadow-soft transition active:scale-95"
              title="Refresh Stream"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#095d7e]' : ''}`} />
            </button>
          </div>
        </div>

        {/* 4 Clinical Vitals & Intake Metric Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-[#e7ebef] shadow-soft hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748b]">Total Calls</span>
              <span className="w-2 h-2 rounded-full bg-[#095d7e]/40" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight text-[#1e293b]">
                {stats.total}
              </span>
              <span className="text-xs text-[#64748b]">logged</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#e7ebef] shadow-soft hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748b]">Completed Rate</span>
              <span className="text-[11px] font-semibold text-[#095d7e] bg-[#eaf4f8] px-2 py-0.5 rounded-full border border-[#c3dfeb]">
                {stats.completionRate}%
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight text-[#095d7e]">
                {stats.completed}
              </span>
              <span className="text-xs text-[#64748b]">answered</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#e7ebef] shadow-soft hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748b]">Avg Handle Time</span>
              <Clock className="w-3.5 h-3.5 text-[#64748b]" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tracking-tight text-[#1e293b]">
                {stats.avgDuration}
              </span>
              <span className="text-xs text-[#64748b]">per call</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#e7ebef] shadow-soft hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748b]">Voicemails & Missed</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                stats.voicemails + stats.missed > 0 
                  ? 'text-rose-700 bg-rose-50 border-rose-200/60' 
                  : 'text-emerald-700 bg-emerald-50 border-emerald-200/60'
              }`}>
                {stats.voicemails} VM / {stats.missed} Missed
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight text-[#1e293b]">
                {stats.voicemails + stats.missed}
              </span>
              <span className="text-xs text-[#64748b]">unanswered</span>
            </div>
          </div>
        </section>

        {/* Filter Pills & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pb-1">
          <div className="flex items-center bg-[#eef2f5] p-1 rounded-full text-xs font-medium border border-[#e2e8f0] overflow-x-auto">
            <button
              onClick={() => setFilter('all')}
              className={`px-3.5 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap ${
                filter === 'all'
                  ? 'bg-white text-[#095d7e] shadow-soft font-semibold'
                  : 'text-[#64748b] hover:text-[#1e293b]'
              }`}
            >
              All Calls ({calls.length})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-3.5 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap ${
                filter === 'completed'
                  ? 'bg-white text-[#095d7e] shadow-soft font-semibold'
                  : 'text-[#64748b] hover:text-[#1e293b]'
              }`}
            >
              Completed ({stats.completed})
            </button>
            <button
              onClick={() => setFilter('missed')}
              className={`px-3.5 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap ${
                filter === 'missed'
                  ? 'bg-white text-amber-700 shadow-soft font-semibold'
                  : 'text-[#64748b] hover:text-[#1e293b]'
              }`}
            >
              Missed ({stats.missed})
            </button>
            <button
              onClick={() => setFilter('voicemail')}
              className={`px-3.5 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap ${
                filter === 'voicemail'
                  ? 'bg-white text-rose-700 shadow-soft font-semibold'
                  : 'text-[#64748b] hover:text-[#1e293b]'
              }`}
            >
              Voicemails ({stats.voicemails})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by phone, clinic, or summary..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-[#e7ebef] focus:border-[#095d7e] focus:ring-2 focus:ring-[#095d7e]/15 rounded-full text-xs text-[#1e293b] placeholder-[#94a3b8] outline-none shadow-soft transition"
            />
          </div>
        </div>

        {/* Main Call Logs Table View */}
        <section className="bg-white rounded-2xl border border-[#e7ebef] shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="bg-[#f8f9fa] border-b border-[#e7ebef] text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">
                  <th scope="col" className="px-5 py-3.5">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#095d7e]" />
                      <span>Date & Time</span>
                    </span>
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    <span className="flex items-center gap-1.5">
                      <PhoneCall className="w-3.5 h-3.5 text-[#095d7e]" />
                      <span>Caller Number</span>
                    </span>
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-[#095d7e]" />
                      <span>Status</span>
                    </span>
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    <span className="flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-[#095d7e]" />
                      <span>Duration</span>
                    </span>
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-[#095d7e]" />
                      <span>Audio Recording</span>
                    </span>
                  </th>
                  <th scope="col" className="px-5 py-3.5 min-w-[320px]">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#095d7e]" />
                      <span>AI Summary</span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {filteredCalls.map((call) => {
                  const audioUrl = call.recording_url || call.voicemail_url;
                  const { datePart, timePart } = formatDateTime(call.created_at);
                  const isExpanded = expandedSummaryIds.has(call.id);

                  return (
                    <tr
                      key={call.id}
                      className="hover:bg-[#f8f9fa]/75 transition-colors group"
                    >
                      {/* Column 1: Date & Time */}
                      <td className="px-5 py-4 align-top whitespace-nowrap">
                        <div className="text-xs font-semibold text-[#1e293b]">
                          {datePart}
                        </div>
                        <div className="text-[11px] text-[#64748b] mt-0.5 font-mono">
                          {timePart}
                        </div>
                      </td>

                      {/* Column 2: Caller Number & Clinic Line */}
                      <td className="px-5 py-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-[#1e293b]">
                            {call.caller_number}
                          </span>
                        </div>
                        {call.patient_name && (
                          <div className="text-[11px] text-[#095d7e] font-medium mt-0.5">
                            {call.patient_name}
                          </div>
                        )}
                        {call.clinic_number && (
                          <div className="text-[10px] text-[#94a3b8] font-mono mt-0.5">
                            Line: {call.clinic_number}
                          </div>
                        )}
                      </td>

                      {/* Column 3: Call Status Badge */}
                      <td className="px-5 py-4 align-top whitespace-nowrap">
                        {call.status === 'completed' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#eaf4f8] text-[#095d7e] border border-[#c3dfeb]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#095d7e]" />
                            <PhoneIncoming className="w-3 h-3 text-[#095d7e]" />
                            <span>completed</span>
                          </span>
                        )}

                        {call.status === 'missed' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <PhoneMissed className="w-3 h-3 text-amber-600" />
                            <span>missed</span>
                          </span>
                        )}

                        {call.status === 'voicemail' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <Voicemail className="w-3 h-3 text-rose-600" />
                            <span>voicemail</span>
                          </span>
                        )}
                      </td>

                      {/* Column 4: Duration */}
                      <td className="px-5 py-4 align-top whitespace-nowrap">
                        {formatDuration(call.duration, call.status)}
                      </td>

                      {/* Column 5: Audio Player & Download Link */}
                      <td className="px-5 py-4 align-top whitespace-nowrap">
                        {audioUrl ? (
                          <div className="flex items-center gap-2">
                            <audio
                              controls
                              preload="none"
                              src={audioUrl}
                              className="h-8 max-w-[200px]"
                            />
                            <a
                              href={audioUrl}
                              download={audioUrl.split('/').pop() || 'call-audio.mp3'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-[#eaf4f8] text-[#095d7e] hover:bg-[#095d7e] hover:text-white transition-colors"
                              title="Download audio recording"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-[#94a3b8] text-xs font-mono">—</span>
                        )}
                      </td>

                      {/* Column 6: AI Summary */}
                      <td className="px-5 py-4 align-top">
                        {call.ai_summary ? (
                          <div className="bg-[#f0f7fa] border border-[#c3dfeb] rounded-xl p-3 text-xs text-[#1e293b]">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-[#095d7e]">
                                <Sparkles className="w-3 h-3 text-[#095d7e]" />
                                <span>AI Clinical Summary</span>
                              </span>
                              {call.ai_summary.length > 110 && (
                                <button
                                  type="button"
                                  onClick={() => toggleSummaryExpand(call.id)}
                                  className="text-[10px] text-[#095d7e] hover:underline font-medium inline-flex items-center gap-0.5"
                                >
                                  <span>{isExpanded ? 'Less' : 'More'}</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                            <p
                              className={`leading-relaxed text-[#1e293b] font-normal transition-all ${
                                !isExpanded && call.ai_summary.length > 110
                                  ? 'line-clamp-2'
                                  : ''
                              }`}
                            >
                              {call.ai_summary}
                            </p>
                          </div>
                        ) : call.status === 'completed' || call.status === 'voicemail' ? (
                          <div className="flex items-center gap-1.5 text-xs text-[#64748b] italic py-1">
                            <Sparkles className="w-3 h-3 text-[#94a3b8] animate-pulse" />
                            <span>Generating summary...</span>
                          </div>
                        ) : (
                          <span className="text-[#94a3b8] text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredCalls.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-16 px-4">
                      <div className="max-w-sm mx-auto space-y-2">
                        <FileText className="w-8 h-8 text-[#94a3b8] mx-auto stroke-[1.5]" />
                        <p className="text-sm font-semibold text-[#1e293b]">
                          No calls matching this filter
                        </p>
                        <p className="text-xs text-[#64748b]">
                          {searchQuery
                            ? `Try adjusting your search query "${searchQuery}"`
                            : 'Incoming OpenPhone events will appear here in real time.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Telemetry Endpoint Card */}
        <div className="bg-white p-5 rounded-2xl border border-[#e7ebef] shadow-soft flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-[#1e293b] uppercase tracking-wider">
              OpenPhone Webhook Receiver Live
            </h3>
            <p className="text-xs text-[#64748b]">
              Point your OpenPhone webhook notifications to:{' '}
              <code className="font-mono text-xs bg-[#eaf4f8] text-[#095d7e] px-2 py-0.5 rounded font-semibold">
                /api/webhooks/openphone
              </code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#095d7e] bg-[#eaf4f8] px-3 py-1 rounded-full border border-[#c3dfeb]">
              Listening: call.completed, call.recording.completed, voicemail.completed, call.summary.completed
            </span>
          </div>
        </div>
      </div>

      {/* OpenPhone Inbound Simulator Modal */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#e7ebef] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-[0_12px_40px_rgba(9,93,126,0.12)]">
            <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-3">
              <h3 className="text-sm font-semibold text-[#1e293b]">Simulate OpenPhone Webhook</h3>
              <button
                onClick={() => setShowSimulateModal(false)}
                className="w-7 h-7 rounded-full bg-[#f1f5f9] hover:bg-[#e2e8f0] flex items-center justify-center text-[#64748b] text-xs font-bold transition"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#64748b]">
              Trigger an incoming OpenPhone webhook event to test table display, audio playback, and AI summary rendering:
            </p>
            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleSimulateCall('completed')}
                className="w-full text-left p-3.5 rounded-xl border border-[#c3dfeb] bg-[#eaf4f8]/50 hover:bg-[#eaf4f8] text-xs font-semibold text-[#095d7e] transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold">call.completed (with Recording)</div>
                  <div className="text-[11px] font-normal text-[#64748b] mt-0.5">Answered call + audio playback + AI notes</div>
                </div>
                <PhoneIncoming className="w-4 h-4 text-[#095d7e]" />
              </button>

              <button
                onClick={() => handleSimulateCall('voicemail')}
                className="w-full text-left p-3.5 rounded-xl border border-rose-200/60 bg-rose-50/50 hover:bg-rose-50 text-xs font-semibold text-rose-800 transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold">voicemail.completed</div>
                  <div className="text-[11px] font-normal text-[#64748b] mt-0.5">Patient left voicemail + audio recording</div>
                </div>
                <Voicemail className="w-4 h-4 text-rose-600" />
              </button>

              <button
                onClick={() => handleSimulateCall('missed')}
                className="w-full text-left p-3.5 rounded-xl border border-amber-200/60 bg-amber-50/50 hover:bg-amber-50 text-xs font-semibold text-amber-800 transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold">call.completed (Missed / 0s)</div>
                  <div className="text-[11px] font-normal text-[#64748b] mt-0.5">Unanswered inbound call</div>
                </div>
                <PhoneMissed className="w-4 h-4 text-amber-600" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
