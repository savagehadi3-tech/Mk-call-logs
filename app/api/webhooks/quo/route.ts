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

// Initialize Supabase admin client strictly using service role key with persistSession: false
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
 * Resilient Non-Destructive Upsert Helper (for call.completed and call.missed):
 * Only includes explicitly defined fields so existing summary/next_steps are preserved.
 */
async function nonDestructiveUpsert(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  callId: string,
  payloadFields: Record<string, any>
) {
  const tableNames = ['calls', 'clinic_call_logs'];
  let lastError: any = null;

  for (const tableName of tableNames) {
    const payload: Record<string, any> = {
      id: String(callId),
    };

    for (const [k, v] of Object.entries(payloadFields)) {
      if (v !== undefined) {
        payload[k] = v;
      }
    }

    let currentPayload = { ...payload };
    let { data, error } = await supabase
      .from(tableName)
      .upsert(currentPayload, { onConflict: 'id' })
      .select()
      .single();

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

    if (!error) {
      return { success: true, table: tableName, data };
    }

    lastError = error;
    if (!error.message.includes('relation') && !error.message.includes('does not exist')) {
      break;
    }
  }

  return { success: false, error: lastError };
}

/**
 * Resilient Non-Destructive Update Helper (for call.summary.completed & call.recording.completed):
 * Executes a targeted .update() that ONLY updates the specific columns provided
 * (e.g. summary, next_steps, or recording_url) and NEVER touches or resets status,
 * caller_number, or duration_seconds.
 */
async function nonDestructiveUpdate(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  callId: string,
  fieldsToUpdate: Record<string, any>
) {
  const tableNames = ['calls', 'clinic_call_logs'];
  let lastError: any = null;

  for (const tableName of tableNames) {
    let currentPayload = { ...fieldsToUpdate };

    let { data, error } = await supabase
      .from(tableName)
      .update(currentPayload)
      .eq('id', String(callId))
      .select();

    if (error && error.message.includes('id')) {
      const retry = await supabase
        .from(tableName)
        .update(currentPayload)
        .eq('call_id', String(callId))
        .select();
      error = retry.error;
      data = retry.data;
    }

    // Gracefully handle missing next_steps column
    if (error && error.message.includes('next_steps')) {
      delete currentPayload.next_steps;
      const retry = await supabase
        .from(tableName)
        .update(currentPayload)
        .eq('id', String(callId))
        .select();
      error = retry.error;
      data = retry.data;
    }

    // Gracefully handle ai_summary vs summary column name
    if (error && error.message.includes('ai_summary')) {
      delete currentPayload.ai_summary;
      const retry = await supabase
        .from(tableName)
        .update(currentPayload)
        .eq('id', String(callId))
        .select();
      error = retry.error;
      data = retry.data;
    }

    if (!error) {
      // If row did not exist yet (e.g. summary webhook arrived before call.completed), insert a stub
      if (!data || data.length === 0) {
        const insertPayload: Record<string, any> = {
          id: String(callId),
          caller_number: 'Unknown',
          status: currentPayload.status || 'completed',
          duration: 0,
          created_at: new Date().toISOString(),
          ...currentPayload,
        };
        await supabase.from(tableName).insert([insertPayload]);
      }
      return { success: true, table: tableName, data };
    }

    lastError = error;
    if (!error.message.includes('relation') && !error.message.includes('does not exist')) {
      break;
    }
  }

  return { success: false, error: lastError };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Read raw text first to enable cryptographic signature verification
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
      console.warn('[Quo Webhook] QUO_WEBHOOK_SECRET is not configured in environment. Skipping signature verification.');
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
       * EVENT 1: call.completed (Accurate Status Detection with answeredBy edge case)
       */
      case 'call.completed': {
        const callId = callData?.id || callData?.callId || callData?.call_id || crypto.randomUUID();

        const caller_number = extractCallerNumber(callData);
        const clinic_number = extractClinicNumber(callData);

        // 1. Check for genuine voicemail
        const hasRealVoicemail = Boolean(
          callData?.voicemail &&
          (Number(callData.voicemail.duration) > 2 || callData.voicemail.url)
        );

        // 2. The answeredBy Edge Case:
        // answeredAt alone can be populated by the automated voicemail greeting picking up.
        // answeredBy (the staff member's Quo User ID) is ONLY populated when a real human answered.
        const answeredBy = callData?.answeredBy || callData?.answered_by || callData?.userId;
        const wasAnsweredByStaff = Boolean(callData?.answeredAt && answeredBy) && !hasRealVoicemail;

        // 3. Strict Status Evaluation Order:
        // - 1) If hasRealVoicemail is true -> 'voicemail'
        // - 2) Else if wasAnsweredByStaff is true -> 'completed'
        //      (Our frontend UI components in app/page.tsx and database schema specifically expect 'completed'
        //      to render the green answered checkmark badge and satisfy calls_status_check constraint)
        // - 3) Otherwise -> 'missed' (fixes callers hanging up during voicemail greeting)
        let status: 'completed' | 'voicemail' | 'missed';
        if (hasRealVoicemail) {
          status = 'voicemail';
        } else if (wasAnsweredByStaff) {
          status = 'completed';
        } else {
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

        console.log(`[Quo Webhook] Upserting call.completed for ${callId} (status: ${status}, answeredBy: ${answeredBy}):`, fieldsToUpsert);

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
       * Updates ONLY summary, ai_summary, and next_steps columns.
       * NEVER touches or resets status, caller_number, or duration_seconds.
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

        // Targeted Non-Destructive Update: ONLY updates summary and next_steps
        const summaryFields: Record<string, any> = {
          ai_summary: summaryText || null,
          summary: summaryText || null,
        };

        if (Array.isArray(nextSteps) && nextSteps.length > 0) {
          summaryFields.next_steps = nextSteps;
        }

        console.log(`[Quo Webhook] Non-destructively updating call.summary.completed for ${callId}:`, summaryFields);

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

        const result = await nonDestructiveUpdate(supabase, callId, summaryFields);
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
       * EVENT 3: call.recording.completed (Live Call Audio Capture & Late Voicemail Upgrade)
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

        console.log(`[Quo Webhook] Processing call.recording.completed for ${callId}:`, recordingUrl);

        // Check for Late Voicemail Upgrade:
        // If Quo finishes processing voicemail audio 2-3s after call.completed marked it 'missed',
        // upgrade status from 'missed' to 'voicemail' and set voicemail_url.
        const answeredBy = callData?.answeredBy || callData?.answered_by;
        const isVoicemailPayload = Boolean(
          callData?.voicemail ||
          callData?.isVoicemail ||
          callData?.mediaType === 'voicemail' ||
          callData?.type === 'voicemail'
        );

        let isCurrentlyMissed = false;
        if (isSupabaseConfigured) {
          const { data: existingCall } = await supabase
            .from('calls')
            .select('status')
            .eq('id', String(callId))
            .maybeSingle();

          if (existingCall && existingCall.status === 'missed') {
            isCurrentlyMissed = true;
          }
        }

        const shouldUpgradeToVoicemail =
          isVoicemailPayload ||
          isCurrentlyMissed ||
          (!answeredBy && Boolean(recordingUrl));

        const recordingFields: Record<string, any> = {
          recording_url: recordingUrl ? String(recordingUrl) : null,
        };

        if (shouldUpgradeToVoicemail) {
          recordingFields.status = 'voicemail';
          recordingFields.voicemail_url = recordingUrl ? String(recordingUrl) : null;
          console.log(`[Quo Webhook] Late voicemail upgrade applied for call ${callId}: status set to 'voicemail'`);
        }

        if (!isSupabaseConfigured) {
          return NextResponse.json({
            success: true,
            event: eventType,
            callId,
            recording_url: recordingUrl,
            status: recordingFields.status || 'unchanged',
            note: 'Supabase credentials not configured in .env.local',
          });
        }

        const result = await nonDestructiveUpdate(supabase, callId, recordingFields);
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
          data: result.data,
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

        const vmFields: Record<string, any> = {
          status: 'voicemail',
          voicemail_url: voicemailUrl ? String(voicemailUrl) : null,
        };

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

        const result = await nonDestructiveUpdate(supabase, callId, vmFields);
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
