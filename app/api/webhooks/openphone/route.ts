import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Mark route as dynamic to avoid static generation during build
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id') &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder.supabase.co')
);

// Initialize Supabase Admin client with service role key to bypass RLS for server webhooks
const getSupabaseAdmin = () => {
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

export async function POST(request: NextRequest) {
  try {
    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    console.log('[OpenPhone Webhook] Received payload:', JSON.stringify(payload, null, 2));

    const eventType = payload?.type || payload?.event || '';
    const callData = payload?.data?.object || payload?.data || payload;

    if (!eventType) {
      return NextResponse.json(
        { success: false, error: 'Missing event type in payload' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    switch (eventType) {
      /**
       * 1. call.completed:
       * - Inspect incoming payload: callData?.status, callData?.duration, and callData?.answeredAt.
       * - If the call was incoming and callData?.duration === 0 (or !callData?.answeredAt / status explicitly indicates missed), set status = 'missed'.
       * - If it was answered and spoke with someone, set status = 'completed' (or 'answered').
       * - Preserve all existing columns (id, caller_number, clinic_number, duration, created_at, etc.) using optional chaining.
       */
      case 'call.completed': {
        const id = callData?.id || callData?.callId || callData?.call_id || crypto.randomUUID();

        // 1. Duration parsing with optional chaining
        const durationRaw = callData?.duration;
        const duration =
          typeof durationRaw === 'number'
            ? durationRaw
            : durationRaw
            ? parseInt(String(durationRaw), 10)
            : 0;
        const validDuration = Number.isFinite(duration) ? duration : 0;

        // 2. Status inspection & mapping
        const rawStatus = (callData?.status || '').toLowerCase().trim();
        const answeredAt = callData?.answeredAt || callData?.answered_at;

        const hasVoicemail =
          rawStatus.includes('voicemail') ||
          Boolean(callData?.voicemail) ||
          Boolean(callData?.voicemailUrl) ||
          Boolean(callData?.voicemail_url);

        let status: 'completed' | 'missed' | 'voicemail' = 'completed';

        if (hasVoicemail) {
          status = 'voicemail';
        } else {
          const isExplicitMissed =
            rawStatus === 'missed' ||
            rawStatus === 'no-answer' ||
            rawStatus === 'unanswered' ||
            rawStatus === 'abandoned' ||
            rawStatus === 'canceled' ||
            rawStatus === 'busy' ||
            rawStatus === 'failed';

          // Any call with duration <= 0, missing answeredAt, or explicit missed indicator is missed
          if (validDuration <= 0 || !answeredAt || isExplicitMissed) {
            status = 'missed';
          } else {
            status = 'completed';
          }
        }

        // 3. Caller and Clinic numbers with optional chaining
        const caller_number =
          callData?.from ||
          callData?.caller ||
          callData?.fromNumber ||
          callData?.caller_number ||
          callData?.phoneNumber ||
          'Unknown';

        const clinic_number =
          callData?.to ||
          callData?.clinic_number ||
          callData?.toNumber ||
          callData?.recipient ||
          null;

        // 4. Audio recording & Voicemail URLs
        const recording_url =
          callData?.recording?.url ||
          callData?.recordingUrl ||
          callData?.mediaUrl ||
          callData?.audioUrl ||
          null;

        const voicemail_url =
          callData?.voicemail?.url ||
          callData?.voicemailUrl ||
          callData?.voicemail_url ||
          null;

        // 5. Created at timestamp
        const rawCreatedAt = callData?.createdAt || callData?.created_at || callData?.timestamp;
        let created_at = new Date().toISOString();
        if (rawCreatedAt) {
          try {
            created_at = new Date(rawCreatedAt).toISOString();
          } catch {
            created_at = new Date().toISOString();
          }
        }

        const callRecord: Record<string, any> = {
          id: String(id),
          caller_number: String(caller_number),
          clinic_number: clinic_number ? String(clinic_number) : null,
          duration: validDuration,
          status,
          created_at,
        };

        if (recording_url) {
          callRecord.recording_url = String(recording_url);
        }

        if (voicemail_url) {
          callRecord.voicemail_url = String(voicemail_url);
        }

        if (callData?.caller_name || callData?.patient_name) {
          callRecord.caller_name = String(callData?.caller_name || callData?.patient_name);
          callRecord.patient_name = String(callData?.caller_name || callData?.patient_name);
        }

        // Extract AI summary if present in call.completed payload
        if (callData?.summary || callData?.aiSummary || callData?.ai_summary) {
          const rawSummary = callData?.ai_summary || callData?.aiSummary || callData?.summary;
          if (typeof rawSummary === 'string') {
            callRecord.ai_summary = rawSummary;
          } else if (Array.isArray(rawSummary)) {
            callRecord.ai_summary = rawSummary
              .map((item: any) => (typeof item === 'string' ? item : JSON.stringify(item)))
              .join('\n');
          } else if (typeof rawSummary === 'object') {
            callRecord.ai_summary =
              rawSummary?.text || rawSummary?.notes || rawSummary?.content || JSON.stringify(rawSummary);
          }
        }

        console.log('[OpenPhone Webhook] Upserting call.completed record:', callRecord);

        if (!isSupabaseConfigured) {
          console.warn('[OpenPhone Webhook] Supabase credentials are placeholder. Processed successfully in demo mode.');
          return NextResponse.json({
            success: true,
            event: eventType,
            data: callRecord,
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        // Attempt upsert with column fallbacks in case schema doesn't have optional fields
        let upsertPayload = { ...callRecord };
        let { data: upsertedData, error } = await supabase
          .from('calls')
          .upsert(upsertPayload, { onConflict: 'id' })
          .select()
          .single();

        if (error && error.message.includes('caller_name')) {
          delete upsertPayload.caller_name;
          const retry = await supabase
            .from('calls')
            .upsert(upsertPayload, { onConflict: 'id' })
            .select()
            .single();
          error = retry.error;
          upsertedData = retry.data;
        }

        if (error && error.message.includes('patient_name')) {
          delete upsertPayload.patient_name;
          const retry = await supabase
            .from('calls')
            .upsert(upsertPayload, { onConflict: 'id' })
            .select()
            .single();
          error = retry.error;
          upsertedData = retry.data;
        }

        if (error) {
          console.error('[OpenPhone Webhook] Error upserting call.completed:', error);
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          event: eventType,
          data: upsertedData || callRecord,
        });
      }

      /**
       * 2. call.missed:
       * - Direct event from OpenPhone when an incoming call ends without being answered.
       * - Sets status = 'missed' and duration = 0.
       */
      case 'call.missed': {
        const id = callData?.id || callData?.callId || callData?.call_id || crypto.randomUUID();
        const caller_number =
          callData?.from ||
          callData?.caller ||
          callData?.fromNumber ||
          callData?.caller_number ||
          callData?.phoneNumber ||
          'Unknown';

        const clinic_number =
          callData?.to ||
          callData?.clinic_number ||
          callData?.toNumber ||
          callData?.recipient ||
          null;

        const rawCreatedAt = callData?.createdAt || callData?.created_at || callData?.timestamp;
        let created_at = new Date().toISOString();
        if (rawCreatedAt) {
          try {
            created_at = new Date(rawCreatedAt).toISOString();
          } catch {
            created_at = new Date().toISOString();
          }
        }

        const callRecord: Record<string, any> = {
          id: String(id),
          caller_number: String(caller_number),
          clinic_number: clinic_number ? String(clinic_number) : null,
          duration: 0,
          status: 'missed',
          created_at,
        };

        if (callData?.caller_name || callData?.patient_name) {
          callRecord.caller_name = String(callData?.caller_name || callData?.patient_name);
          callRecord.patient_name = String(callData?.caller_name || callData?.patient_name);
        }

        console.log('[OpenPhone Webhook] Upserting call.missed record:', callRecord);

        if (!isSupabaseConfigured) {
          return NextResponse.json({
            success: true,
            event: eventType,
            data: callRecord,
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        let upsertPayload = { ...callRecord };
        let { data: upsertedData, error } = await supabase
          .from('calls')
          .upsert(upsertPayload, { onConflict: 'id' })
          .select()
          .single();

        if (error && error.message.includes('caller_name')) {
          delete upsertPayload.caller_name;
          const retry = await supabase
            .from('calls')
            .upsert(upsertPayload, { onConflict: 'id' })
            .select()
            .single();
          error = retry.error;
          upsertedData = retry.data;
        }

        if (error && error.message.includes('patient_name')) {
          delete upsertPayload.patient_name;
          const retry = await supabase
            .from('calls')
            .upsert(upsertPayload, { onConflict: 'id' })
            .select()
            .single();
          error = retry.error;
          upsertedData = retry.data;
        }

        if (error) {
          console.error('[OpenPhone Webhook] Error upserting call.missed:', error);
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          event: eventType,
          data: upsertedData || callRecord,
        });
      }

      /**
       * 3. call.recording.completed:
       * - Extract callId (callData?.callId or callData?.id) and recording URL (callData?.mediaUrl or callData?.url).
       * - Update calls where id = callId setting recording_url = url.
       */
      case 'call.recording.completed': {
        const callId = callData?.callId || callData?.call_id || callData?.id;
        const recordingUrl =
          callData?.mediaUrl ||
          callData?.url ||
          callData?.recording?.url ||
          callData?.recordingUrl ||
          null;

        if (!callId) {
          return NextResponse.json(
            { success: false, error: 'Missing callId for call.recording.completed' },
            { status: 400 }
          );
        }

        console.log(`[OpenPhone Webhook] Updating call ${callId} with recording_url:`, recordingUrl);

        if (!isSupabaseConfigured) {
          return NextResponse.json({
            success: true,
            event: eventType,
            callId,
            recording_url: recordingUrl,
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        const { error } = await supabase
          .from('calls')
          .update({ recording_url: recordingUrl ? String(recordingUrl) : null })
          .eq('id', String(callId));

        if (error) {
          console.error('[OpenPhone Webhook] Error updating recording_url:', error);
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          event: eventType,
          callId,
          recording_url: recordingUrl,
        });
      }

      /**
       * 4. voicemail.completed / call.voicemail.completed:
       * - Extract callId and media URL (callData?.mediaUrl or callData?.voicemail?.url).
       * - Update calls where id = callId setting voicemail_url = url and status = 'voicemail'.
       */
      case 'voicemail.completed':
      case 'call.voicemail.completed': {
        const callId = callData?.callId || callData?.call_id || callData?.id;
        const voicemailUrl =
          callData?.mediaUrl ||
          callData?.voicemail?.url ||
          callData?.voicemailUrl ||
          callData?.url ||
          null;

        if (!callId) {
          return NextResponse.json(
            { success: false, error: 'Missing callId for voicemail.completed' },
            { status: 400 }
          );
        }

        console.log(`[OpenPhone Webhook] Updating call ${callId} with voicemail_url:`, voicemailUrl);

        if (!isSupabaseConfigured) {
          return NextResponse.json({
            success: true,
            event: eventType,
            callId,
            voicemail_url: voicemailUrl,
            status: 'voicemail',
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        const { error } = await supabase
          .from('calls')
          .update({
            voicemail_url: voicemailUrl ? String(voicemailUrl) : null,
            status: 'voicemail',
          })
          .eq('id', String(callId));

        if (error) {
          console.error('[OpenPhone Webhook] Error updating voicemail_url:', error);
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          event: eventType,
          callId,
          voicemail_url: voicemailUrl,
          status: 'voicemail',
        });
      }

      /**
       * 4. call.summary.completed:
       * - Extract callId and callData?.summary (join array if it is an array of strings, or convert object/string to readable text).
       * - Update calls where id = callId setting ai_summary = summaryText.
       */
      case 'call.summary.completed': {
        const callId = callData?.callId || callData?.call_id || callData?.id;
        let summaryText = '';

        const rawSummary = callData?.ai_summary || callData?.aiSummary || callData?.summary || callData?.transcript;

        if (typeof rawSummary === 'string') {
          summaryText = rawSummary;
        } else if (Array.isArray(rawSummary)) {
          summaryText = rawSummary
            .map((item: any) => (typeof item === 'string' ? item : JSON.stringify(item)))
            .join('\n');
        } else if (rawSummary && typeof rawSummary === 'object') {
          summaryText =
            rawSummary?.text ||
            rawSummary?.notes ||
            rawSummary?.content ||
            (Array.isArray(rawSummary?.bullets)
              ? rawSummary.bullets.join('\n')
              : JSON.stringify(rawSummary));
        }

        if (!callId) {
          return NextResponse.json(
            { success: false, error: 'Missing callId for call.summary.completed' },
            { status: 400 }
          );
        }

        console.log(`[OpenPhone Webhook] Updating call ${callId} with ai_summary:`, summaryText);

        if (!isSupabaseConfigured) {
          return NextResponse.json({
            success: true,
            event: eventType,
            callId,
            ai_summary: summaryText,
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        // Try updating ai_summary, fallback to summary if column differs
        let { error } = await supabase
          .from('calls')
          .update({ ai_summary: summaryText || null })
          .eq('id', String(callId));

        if (error && error.message.includes('ai_summary')) {
          const retry = await supabase
            .from('calls')
            .update({ summary: summaryText || null })
            .eq('id', String(callId));
          error = retry.error;
        }

        if (error) {
          console.error('[OpenPhone Webhook] Error updating ai_summary:', error);
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          event: eventType,
          callId,
          ai_summary: summaryText,
        });
      }

      default:
        console.log(`[OpenPhone Webhook] Unhandled event type: ${eventType}`);
        return NextResponse.json({
          success: true,
          message: `Ignored unhandled event type: ${eventType}`,
        });
    }
  } catch (err: any) {
    console.error('[OpenPhone Webhook] Fatal handler exception:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal server error processing OpenPhone webhook',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'OpenPhone Webhook Handler',
    endpoint: '/api/webhooks/openphone',
    supported_events: [
      'call.completed',
      'call.missed',
      'call.recording.completed',
      'voicemail.completed',
      'call.voicemail.completed',
      'call.summary.completed',
    ],
  });
}
