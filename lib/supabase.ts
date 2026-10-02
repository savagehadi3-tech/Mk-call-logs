import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

export type CallType = 'answered' | 'missed' | 'voicemail';
export type CallStatus = 'pending' | 'callback_needed' | 'resolved';

export interface CallRecord {
  id: string;
  caller_number: string;
  call_type: CallType;
  status: CallStatus;
  duration?: number | null;
  recording_url?: string | null;
  summary?: string | null;
  created_at: string;
  patient_name?: string | null;
  urgency?: 'low' | 'medium' | 'high' | 'emergency';
}

export interface ReviewRequest {
  id: string;
  patient_name?: string | null;
  patient_phone: string;
  status: 'sent' | 'delivered' | 'completed' | 'failed';
  rating?: number | null;
  feedback?: string | null;
  created_at: string;
}

// Browser / Public Client with safe build-time fallback
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Admin / Service Role Client (Used in server webhook routes to bypass RLS)
export const getServiceSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder-service-role-key';

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
