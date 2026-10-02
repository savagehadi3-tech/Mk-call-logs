import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, CallRecord, CallType, CallStatus } from '@/lib/supabase';

// Mark route as dynamic to prevent static pre-rendering evaluation during Netlify build
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log('Received telephony webhook payload:', JSON.stringify(payload, null, 2));

    // Handle OpenPhone / Quo / Generic telephony event structures
    const data = payload.data?.object || payload.data || payload;

    // Extract ID (generate fallback UUID if missing)
    const id = data.id || data.callId || data.call_id || crypto.randomUUID();

    // Extract caller number
    const caller_number =
      data.from ||
      data.caller ||
      data.fromNumber ||
      data.caller_number ||
      data.phoneNumber ||
      'Unknown Caller';

    // Determine Call Type: answered, missed, or voicemail
    let call_type: CallType = 'answered';
    const directionOrStatus = (data.status || data.direction || data.type || payload.type || payload.event || '').toLowerCase();
    
    if (directionOrStatus.includes('voicemail') || data.voicemailUrl || data.voicemail_url) {
      call_type = 'voicemail';
    } else if (directionOrStatus.includes('missed') || data.answered === false || data.status === 'no-answer') {
      call_type = 'missed';
    } else {
      call_type = 'answered';
    }

    // Extract Audio Recording URL
    const recording_url =
      data.recordingUrl ||
      data.voicemailUrl ||
      data.recording_url ||
      data.voicemail_url ||
      data.mediaUrl ||
      data.audioUrl ||
      null;

    // Extract Duration in seconds
    const duration = typeof data.duration === 'number' ? data.duration : (data.duration ? parseInt(data.duration, 10) : null);

    // Extract AI Summary
    const summary =
      data.summary ||
      data.aiSummary ||
      data.transcript ||
      data.notes ||
      (call_type === 'voicemail' ? 'Voicemail received. Please listen to audio recording for details.' : null);

    // Default status
    const status: CallStatus = call_type === 'answered' ? 'resolved' : 'callback_needed';

    // Timestamp
    const created_at = data.createdAt || data.created_at || data.timestamp || new Date().toISOString();

    const record: Partial<CallRecord> = {
      id: String(id),
      caller_number: String(caller_number),
      call_type,
      status,
      duration: duration ?? null,
      recording_url: recording_url ?? null,
      summary: summary ?? null,
      created_at: new Date(created_at).toISOString(),
    };

    const supabaseAdmin = getServiceSupabase();

    const { data: upsertedData, error } = await supabaseAdmin
      .from('calls')
      .upsert(record, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('Supabase upsert error in webhook:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          hint: 'Ensure calls table exists in Supabase. You can run the schema in supabase-schema.sql',
          received: record,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Call log upserted successfully',
      data: upsertedData || record,
    });
  } catch (err: any) {
    console.error('Webhook handler error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal server error processing telephony payload',
      },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'online',
    endpoint: '/api/webhook',
    description: 'Telephony webhook receiver for OpenPhone / Quo / Voip providers',
  });
}
