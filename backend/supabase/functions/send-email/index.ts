import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Recipient = { email?: unknown; name?: unknown };
type RequestBody = {
  recipients?: unknown;
  subject?: unknown;
  message?: unknown;
  html?: unknown;
  campaign_id?: unknown;
  dispatch_key?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeError(value: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  return value.replaceAll(apiKey, '[redacted]').slice(0, 500);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')?.trim();
  const fromName = Deno.env.get('RESEND_FROM_NAME')?.trim() || 'G.S Gacuba 2A Administration';

  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!resendApiKey || !fromEmail) return jsonResponse({ error: 'Email service not configured' }, 503);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse({ error: 'Session expired' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from('users')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError || !['dean_of_studies', 'headteacher', 'it'].includes(String(profile?.role))) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const recipients = Array.isArray(body.recipients) ? body.recipients as Recipient[] : [];
  const validRecipients = recipients
    .map((recipient) => ({
      email: typeof recipient.email === 'string' ? recipient.email.trim().toLowerCase() : '',
      name: typeof recipient.name === 'string' ? recipient.name.trim().slice(0, 120) : 'Parent',
    }))
    .filter((recipient) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email));
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body.message === 'string' ? body.message.trim() : '';
  const html = typeof body.html === 'string' ? body.html.trim() : '';
  const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id : null;
  const dispatchKey = typeof body.dispatch_key === 'string' ? body.dispatch_key.trim() : null;

  if (!validRecipients.length || validRecipients.length > 100) return jsonResponse({ error: 'Invalid recipient list' }, 400);
  if (!subject || subject.length > 200 || !text || text.length > 10000 || !html || html.length > 100000) {
    return jsonResponse({ error: 'Invalid email content' }, 400);
  }

  const receipts: Array<{
    email: string;
    status: 'Delivered' | 'Failed';
    messageId: string;
    timestamp: string;
  }> = [];

  for (const recipient of validRecipients) {
    const timestamp = new Date().toISOString();
    let status: 'Delivered' | 'Failed' = 'Failed';
    let messageId = '';
    let errorMessage: string | null = null;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [recipient.email],
          subject,
          html,
          text,
        }),
      });
      const providerData = await response.json().catch(() => ({})) as { id?: string; message?: string };
      if (response.ok && typeof providerData.id === 'string' && providerData.id) {
        status = 'Delivered';
        messageId = providerData.id;
      } else {
        errorMessage = safeError(String(providerData.message || response.statusText));
      }
    } catch (error) {
      errorMessage = error instanceof Error ? safeError(error.message) : 'Provider request failed';
    }

    receipts.push({ email: recipient.email, status, messageId, timestamp });
    const { error: logError } = await adminClient.from('email_dispatches').insert({
      campaign_id: campaignId,
      dispatch_key: dispatchKey,
      recipient_email: recipient.email,
      recipient_name: recipient.name,
      subject,
      provider: 'resend',
      provider_message_id: messageId || null,
      status,
      error_message: errorMessage,
      sent_at: status === 'Delivered' ? timestamp : null,
      created_by: authData.user.id,
    });
    if (logError) console.error('Email delivery log insert failed:', logError.message);
  }

  const delivered = receipts.filter((receipt) => receipt.status === 'Delivered').length;
  return jsonResponse({
    success: delivered > 0,
    provider: 'resend',
    totalSent: delivered,
    message: `Dispatched ${delivered} email(s) via Resend`,
    deliveryReceipts: receipts,
  });
});
