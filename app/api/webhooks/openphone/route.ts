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
    const payload = await request.json();
    console.log('[OpenPhone Webhook] Received payload:', JSON.stringify(payload, null, 2));

    const eventType = payload.type || payload.event || '';
    const data = payload.data?.object || payload.data || payload;

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
       * - Calculate status: if duration > 0 then 'completed' else 'missed'.
       * - Upsert into calls: id, caller_number (data.from), clinic_number (data.to), duration, status, and created_at.
       * - If recording info is attached (data.recording?.url or data.mediaUrl), also set recording_url.
       */
      case 'call.completed': {
        const id = data.id || data.callId || data.call_id || crypto.randomUUID();
        const durationRaw = data.duration;
        const duration =
          typeof durationRaw === 'number'
            ? durationRaw
            : durationRaw
            ? parseInt(String(durationRaw), 10)
            : 0;

        const status = duration > 0 ? 'completed' : 'missed';
        const caller_number =
          data.from ||
          data.caller ||
          data.fromNumber ||
          data.caller_number ||
          data.phoneNumber ||
          'Unknown';
        const clinic_number =
          data.to ||
          data.clinic_number ||
          data.toNumber ||
          data.recipient ||
          null;

        const recording_url =
          data.recording?.url ||
          data.recordingUrl ||
          data.mediaUrl ||
          data.audioUrl ||
          null;

        const created_at =
          data.createdAt ||
          data.created_at ||
          data.timestamp ||
          new Date().toISOString();

        const callRecord: Record<string, any> = {
          id: String(id),
          caller_number: String(caller_number),
          clinic_number: clinic_number ? String(clinic_number) : null,
          duration: Number.isFinite(duration) ? duration : 0,
          status,
          created_at: new Date(created_at).toISOString(),
        };

        if (recording_url) {
          callRecord.recording_url = String(recording_url);
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

        const { data: upsertedData, error } = await supabase
          .from('calls')
          .upsert(callRecord, { onConflict: 'id' })
          .select()
          .single();

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
       * 2. call.recording.completed:
       * - Extract callId (data.callId or data.id) and recording URL (data.mediaUrl or data.url).
       * - Update calls where id = callId setting recording_url = url.
       */
      case 'call.recording.completed': {
        const callId = data.callId || data.call_id || data.id;
        const recordingUrl =
          data.mediaUrl ||
          data.url ||
          data.recording?.url ||
          data.recordingUrl ||
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
       * 3. voicemail.completed:
       * - Extract callId and media URL (data.mediaUrl or data.voicemail?.url).
       * - Update calls where id = callId setting voicemail_url = url and status = 'voicemail'.
       */
      case 'voicemail.completed': {
        const callId = data.callId || data.call_id || data.id;
        const voicemailUrl =
          data.mediaUrl ||
          data.voicemail?.url ||
          data.voicemailUrl ||
          data.url ||
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
       * - Extract callId and data.summary (join array if it is an array of strings, or convert object/string to readable text).
       * - Update calls where id = callId setting ai_summary = summaryText.
       */
      case 'call.summary.completed': {
        const callId = data.callId || data.call_id || data.id;
        let summaryText = '';

        if (typeof data.summary === 'string') {
          summaryText = data.summary;
        } else if (Array.isArray(data.summary)) {
          summaryText = data.summary
            .map((item: any) => (typeof item === 'string' ? item : JSON.stringify(item)))
            .join('\n');
        } else if (data.summary && typeof data.summary === 'object') {
          summaryText =
            data.summary.text ||
            data.summary.notes ||
            data.summary.content ||
            (Array.isArray(data.summary.bullets)
              ? data.summary.bullets.join('\n')
              : JSON.stringify(data.summary));
        } else if (typeof data.aiSummary === 'string') {
          summaryText = data.aiSummary;
        } else if (typeof data.transcript === 'string') {
          summaryText = data.transcript;
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

        const { error } = await supabase
          .from('calls')
          .update({ ai_summary: summaryText || null })
          .eq('id', String(callId));

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
      'call.recording.completed',
      'voicemail.completed',
      'call.summary.completed',
    ],
  });
}
