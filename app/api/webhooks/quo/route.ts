import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Mark route as dynamic to avoid static page generation during build
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id') &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder.supabase.co')
);

// Initialize Supabase admin client strictly using service role key to bypass RLS for webhooks
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

/**
 * Helper: Safely extracts caller phone number whether callData.participants
 * is an array of strings (['+1...']), an array of objects ([{ phoneNumber: '+1...' }]),
 * or fallback to callData.from.
 */
function extractCallerNumber(callData: any): string {
  if (Array.isArray(callData?.participants) && callData.participants.length > 0) {
    const first = callData.participants[0];
    if (typeof first === 'string' && first.trim()) {
      return first.trim();
    }
    if (first && typeof first === 'object') {
      const num = first.phoneNumber || first.number || first.phone || first.id;
      if (typeof num === 'string' && num.trim()) {
        return num.trim();
      }
    }
  }

  return (
    callData?.from ||
    callData?.caller ||
    callData?.fromNumber ||
    callData?.caller_number ||
    callData?.phoneNumber ||
    'Unknown Caller'
  );
}

/**
 * Helper: Safely extracts clinic phone number / line recipient
 */
function extractClinicNumber(callData: any): string | null {
  const val =
    callData?.to ||
    callData?.clinic_number ||
    callData?.toNumber ||
    callData?.recipient;
  return val ? String(val) : null;
}

/**
 * Helper: Verifies Quo / OpenPhone cryptographic signature
 * Format: openphone-signature: hmac;1;<timestamp>;<signature>
 * The signed data is `${timestamp}.${rawBody}`.
 * The signature is an HMAC-SHA256 digest (Base64).
 */
function verifySignature(
  header: string | null,
  rawBody: string,
  secret: string
): { isValid: boolean; reason?: string } {
  if (!header) {
    return { isValid: false, reason: 'Missing openphone-signature header' };
  }

  const parts = header.split(';');
  if (parts.length < 4) {
    return { isValid: false, reason: 'Malformed openphone-signature header format' };
  }

  const [scheme, version, timestamp, receivedSignature] = parts;

  if (scheme !== 'hmac' || version !== '1') {
    return { isValid: false, reason: `Unsupported scheme or version: ${scheme};${version}` };
  }

  if (!timestamp || !receivedSignature) {
    return { isValid: false, reason: 'Missing timestamp or signature in header' };
  }

  const signedPayload = `${timestamp}.${rawBody}`;

  const testKey = (keyBuf: Buffer): boolean => {
    try {
      const hmac = crypto.createHmac('sha256', keyBuf);
      hmac.update(signedPayload);
      const computedBuf = hmac.digest();

      // Test Base64 digest
      const candBase64 = Buffer.from(receivedSignature, 'base64');
      if (candBase64.length === computedBuf.length && crypto.timingSafeEqual(computedBuf, candBase64)) {
        return true;
      }

      // Test Hex digest fallback
      if (/^[0-9a-fA-F]+$/.test(receivedSignature)) {
        const candHex = Buffer.from(receivedSignature, 'hex');
        if (candHex.length === computedBuf.length && crypto.timingSafeEqual(computedBuf, candHex)) {
          return true;
        }
      }
    } catch {}
    return false;
  };

  // 1. Try decoding secret as Base64 (standard Quo webhook secret specification)
  try {
    const base64Secret = Buffer.from(secret, 'base64');
    if (base64Secret.length > 0 && testKey(base64Secret)) {
      return { isValid: true };
    }
  } catch {}

  // 2. Try raw UTF-8 secret
  try {
    const utf8Secret = Buffer.from(secret, 'utf8');
    if (testKey(utf8Secret)) {
      return { isValid: true };
    }
  } catch {}

  return { isValid: false, reason: 'Cryptographic signature mismatch' };
}

/**
 * Resilient Non-Destructive Upsert Helper:
 * Preserves existing columns (e.g. summary, next_steps) when updating call.completed,
 * and preserves caller_number, status, duration when updating call.summary.completed.
 * Automatically handles schema variations (calls vs clinic_call_logs, id vs call_id,
 * status check constraints, optional caller_name/next_steps columns).
 */
async function nonDestructiveUpsert(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  callId: string,
  payloadFields: Record<string, any>
) {
  const tableNames = ['calls', 'clinic_call_logs'];
  let lastError: any = null;

  for (const tableName of tableNames) {
    // Construct payload with only explicitly defined fields
    const payload: Record<string, any> = {
      id: String(callId),
    };

    for (const [k, v] of Object.entries(payloadFields)) {
      if (v !== undefined) {
        payload[k] = v;
      }
    }

    // Try primary key onConflict: 'id'
    let currentPayload = { ...payload };
    let { data, error } = await supabase
      .from(tableName)
      .upsert(currentPayload, { onConflict: 'id' })
      .select()
      .single();

    // If 'id' is not the primary key, try onConflict: 'call_id'
    if (error && error.message.includes('id')) {
      currentPayload.call_id = String(callId);
      const retryCallId = await supabase
        .from(tableName)
        .upsert(currentPayload, { onConflict: 'call_id' })
        .select()
        .single();
      error = retryCallId.error;
      data = retryCallId.data;
    }

    // Gracefully handle missing optional columns
    if (error && error.message.includes('next_steps')) {
      delete currentPayload.next_steps;
      const retry = await supabase
        .from(tableName)
        .upsert(currentPayload, { onConflict: currentPayload.call_id ? 'call_id' : 'id' })
        .select()
        .single();
      error = retry.error;
      data = retry.data;
    }

    if (error && (error.message.includes('caller_name') || error.message.includes('patient_name'))) {
      delete currentPayload.caller_name;
      delete currentPayload.patient_name;
      const retry = await supabase
        .from(tableName)
        .upsert(currentPayload, { onConflict: currentPayload.call_id ? 'call_id' : 'id' })
        .select()
        .single();
      error = retry.error;
      data = retry.data;
    }

    if (error && error.message.includes('ai_summary')) {
      if (currentPayload.ai_summary) {
        currentPayload.summary = currentPayload.ai_summary;
      }
      delete currentPayload.ai_summary;
      const retry = await supabase
        .from(tableName)
        .upsert(currentPayload, { onConflict: currentPayload.call_id ? 'call_id' : 'id' })
        .select()
        .single();
      error = retry.error;
      data = retry.data;
    }

    // Fallback if status constraint enforces ('completed', 'missed', 'voicemail') instead of 'answered'
    if (error && (error.message.includes('status') || error.message.includes('check constraint'))) {
      if (currentPayload.status === 'answered') {
        currentPayload.status = 'completed';
        const retry = await supabase
          .from(tableName)
          .upsert(currentPayload, { onConflict: currentPayload.call_id ? 'call_id' : 'id' })
          .select()
          .single();
        error = retry.error;
        data = retry.data;
      }
    }

    if (!error) {
      return { success: true, table: tableName, data };
    }

    lastError = error;
    // If table does not exist, try next table candidate in loop
    if (!error.message.includes('relation') && !error.message.includes('does not exist')) {
      break;
    }
  }

  return { success: false, error: lastError };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Read raw text first to allow cryptographic signature verification
    const rawBody = await req.text();

    // 2. Cryptographic signature verification if QUO_WEBHOOK_SECRET is configured
    const webhookSecret = process.env.QUO_WEBHOOK_SECRET || process.env.OPENPHONE_WEBHOOK_SECRET;

    if (webhookSecret) {
      const signatureHeader = req.headers.get('openphone-signature');
      const { isValid, reason } = verifySignature(signatureHeader, rawBody, webhookSecret);

      if (!isValid) {
        console.error(`[Quo Webhook] Cryptographic signature verification failed: ${reason}`);
        return NextResponse.json(
          { success: false, error: 'Invalid webhook signature', reason },
          { status: 401 }
        );
      }
    } else {
      console.warn('[Quo Webhook] QUO_WEBHOOK_SECRET is not configured in environment. Skipping cryptographic signature verification.');
    }

    // 3. Parse JSON body safely
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('[Quo Webhook] Malformed JSON payload received:', parseErr);
      return NextResponse.json(
        { success: false, error: 'Malformed JSON payload' },
        { status: 400 }
      );
    }

    console.log('[Quo Webhook] Processing event payload:', JSON.stringify(payload, null, 2));

    const eventType = payload?.type || payload?.event || '';
    const callData = payload?.data?.object || payload?.data?.resource || payload?.data || payload;

    if (!eventType) {
      return NextResponse.json(
        { success: false, error: 'Missing event type in payload' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    switch (eventType) {
      /**
       * EVENT 1: call.completed (Accurate Status Detection)
       */
      case 'call.completed': {
        const callId = callData?.id || callData?.callId || callData?.call_id || crypto.randomUUID();

        // Caller phone number extraction (handles string array, object array, and fallback)
        const caller_number = extractCallerNumber(callData);
        const clinic_number = extractClinicNumber(callData);

        // Accurate Status Determination:
        // - wasAnsweredByStaff: true if staff picked up
        // - hasRealVoicemail: true if voicemail duration > 2s or voicemail audio URL exists
        const wasAnsweredByStaff = Boolean(callData?.answeredAt);
        const hasRealVoicemail = Boolean(
          callData?.voicemail &&
          (Number(callData.voicemail.duration) > 2 || callData.voicemail.url)
        );

        let status: 'answered' | 'voicemail' | 'missed';
        if (wasAnsweredByStaff) {
          status = 'answered';
        } else if (hasRealVoicemail) {
          status = 'voicemail';
        } else {
          // Fixes callers hanging up during voicemail greeting being marked as completed
          status = 'missed';
        }

        // Duration parsing
        const durationRaw = callData?.duration;
        const duration =
          typeof durationRaw === 'number'
            ? durationRaw
            : durationRaw
            ? parseInt(String(durationRaw), 10)
            : 0;
        const validDuration = Number.isFinite(duration) ? duration : 0;

        // Audio URL extraction
        const audioUrl =
          callData?.voicemail?.url ||
          callData?.voicemailUrl ||
          callData?.recording?.url ||
          callData?.recordingUrl ||
          callData?.mediaUrl ||
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

        // Non-destructive payload: ONLY include defined fields so existing summary/next_steps are preserved
        const fieldsToUpsert: Record<string, any> = {
          caller_number: String(caller_number),
          clinic_number,
          duration: validDuration,
          status,
          created_at,
        };

        if (audioUrl) {
          if (status === 'voicemail' || hasRealVoicemail) {
            fieldsToUpsert.voicemail_url = audioUrl;
          } else {
            fieldsToUpsert.recording_url = audioUrl;
          }
        }

        if (callData?.caller_name || callData?.patient_name) {
          fieldsToUpsert.caller_name = String(callData.caller_name || callData.patient_name);
          fieldsToUpsert.patient_name = String(callData.caller_name || callData.patient_name);
        }

        console.log(`[Quo Webhook] Upserting call.completed for ${callId}:`, fieldsToUpsert);

        if (!isSupabaseConfigured) {
          return NextResponse.json({
            success: true,
            event: eventType,
            data: { id: callId, ...fieldsToUpsert },
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        const result = await nonDestructiveUpsert(supabase, callId, fieldsToUpsert);
        if (!result.success) {
          console.error('[Quo Webhook] Database error upserting call.completed:', result.error);
          return NextResponse.json(
            { success: false, error: result.error?.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          event: eventType,
          callId,
          data: result.data,
        });
      }

      /**
       * EVENT 2: call.summary.completed (AI Summary & Action Items)
       */
      case 'call.summary.completed': {
        const callId = callData?.callId || callData?.id;

        if (!callId) {
          console.error('[Quo Webhook] Missing callId for call.summary.completed');
          return NextResponse.json(
            { success: false, error: 'Missing callId for call.summary.completed' },
            { status: 400 }
          );
        }

        const rawSummary = callData?.summary ?? callData?.ai_summary ?? callData?.aiSummary;
        let summaryText = '';

        if (Array.isArray(rawSummary)) {
          summaryText = rawSummary
            .map((item: any) => (typeof item === 'string' ? item : JSON.stringify(item)))
            .join('\n');
        } else if (typeof rawSummary === 'string') {
          summaryText = rawSummary;
        } else if (rawSummary && typeof rawSummary === 'object') {
          summaryText =
            rawSummary.text ||
            rawSummary.notes ||
            rawSummary.content ||
            (Array.isArray(rawSummary.bullets) ? rawSummary.bullets.join('\n') : JSON.stringify(rawSummary));
        }

        const nextSteps = callData?.nextSteps || callData?.next_steps || [];

        // Non-destructive update: ONLY updates summary and next_steps columns without wiping caller_number, status, or duration
        const summaryFields: Record<string, any> = {
          ai_summary: summaryText || null,
          summary: summaryText || null,
        };

        if (Array.isArray(nextSteps) && nextSteps.length > 0) {
          summaryFields.next_steps = nextSteps;
        }

        console.log(`[Quo Webhook] Updating call.summary.completed for ${callId}:`, summaryFields);

        if (!isSupabaseConfigured) {
          return NextResponse.json({
            success: true,
            event: eventType,
            callId,
            summary: summaryText,
            nextSteps,
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        const result = await nonDestructiveUpsert(supabase, callId, summaryFields);
        if (!result.success) {
          console.error('[Quo Webhook] Database error updating call.summary.completed:', result.error);
          return NextResponse.json(
            { success: false, error: result.error?.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          event: eventType,
          callId,
          data: result.data,
        });
      }

      /**
       * EVENT 3: call.recording.completed (Live Call Audio Capture)
       */
      case 'call.recording.completed': {
        const callId = callData?.callId || callData?.id;
        const recordingUrl =
          callData?.url ||
          callData?.recordingUrl ||
          callData?.mediaUrl ||
          callData?.recording?.url ||
          null;

        if (!callId) {
          console.error('[Quo Webhook] Missing callId for call.recording.completed');
          return NextResponse.json(
            { success: false, error: 'Missing callId for call.recording.completed' },
            { status: 400 }
          );
        }

        console.log(`[Quo Webhook] Updating recording_url for call ${callId}:`, recordingUrl);

        if (!isSupabaseConfigured) {
          return NextResponse.json({
            success: true,
            event: eventType,
            callId,
            recording_url: recordingUrl,
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        const recordingFields: Record<string, any> = {
          recording_url: recordingUrl ? String(recordingUrl) : null,
        };

        const result = await nonDestructiveUpsert(supabase, callId, recordingFields);
        if (!result.success) {
          console.error('[Quo Webhook] Database error updating call.recording.completed:', result.error);
          return NextResponse.json(
            { success: false, error: result.error?.message },
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
       * Direct missed call event (call.missed)
       */
      case 'call.missed': {
        const callId = callData?.id || callData?.callId || callData?.call_id || crypto.randomUUID();
        const caller_number = extractCallerNumber(callData);
        const clinic_number = extractClinicNumber(callData);

        const rawCreatedAt = callData?.createdAt || callData?.created_at || callData?.timestamp;
        let created_at = new Date().toISOString();
        if (rawCreatedAt) {
          try {
            created_at = new Date(rawCreatedAt).toISOString();
          } catch {
            created_at = new Date().toISOString();
          }
        }

        const missedFields: Record<string, any> = {
          caller_number: String(caller_number),
          clinic_number,
          duration: 0,
          status: 'missed',
          created_at,
        };

        console.log(`[Quo Webhook] Upserting call.missed for ${callId}:`, missedFields);

        if (!isSupabaseConfigured) {
          return NextResponse.json({
            success: true,
            event: eventType,
            data: { id: callId, ...missedFields },
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        const result = await nonDestructiveUpsert(supabase, callId, missedFields);
        if (!result.success) {
          console.error('[Quo Webhook] Database error upserting call.missed:', result.error);
          return NextResponse.json(
            { success: false, error: result.error?.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          event: eventType,
          callId,
          data: result.data,
        });
      }

      /**
       * Direct voicemail completed event (voicemail.completed / call.voicemail.completed)
       */
      case 'voicemail.completed':
      case 'call.voicemail.completed': {
        const callId = callData?.callId || callData?.id;
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

        console.log(`[Quo Webhook] Updating voicemail_url for call ${callId}:`, voicemailUrl);

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

        const vmFields: Record<string, any> = {
          status: 'voicemail',
          voicemail_url: voicemailUrl ? String(voicemailUrl) : null,
        };

        const result = await nonDestructiveUpsert(supabase, callId, vmFields);
        if (!result.success) {
          console.error('[Quo Webhook] Database error updating voicemail.completed:', result.error);
          return NextResponse.json(
            { success: false, error: result.error?.message },
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

      default:
        console.log(`[Quo Webhook] Ignored unhandled event type: ${eventType}`);
        return NextResponse.json({
          success: true,
          message: `Ignored unhandled event type: ${eventType}`,
        });
    }
  } catch (err: any) {
    console.error('[Quo Webhook] Fatal handler exception:', err);
    // Return clean JSON 500 so Quo gets standard error response without dropping connection
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal server error processing Quo webhook',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'Quo (OpenPhone) Hardened Webhook Handler',
    endpoint: '/api/webhooks/quo',
    supported_events: [
      'call.completed',
      'call.summary.completed',
      'call.recording.completed',
      'call.missed',
      'voicemail.completed',
      'call.voicemail.completed',
    ],
  });
}
