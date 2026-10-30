import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const defaultApiUrl = 'https://api.sandbox.africastalking.com/version1/messaging';

const allowedApiUrls = new Set([
  'https://api.sandbox.africastalking.com/version1/messaging',
  'https://api.africastalking.com/version1/messaging',
]);

type AfricaTalkingRecipient = {
  number?: string;
  status?: string;
  statusCode?: number | string;
  cost?: string;
  messageId?: string;
};

type AfricaTalkingResponse = {
  SMSMessageData?: {
    Message?: string;
    Recipients?: AfricaTalkingRecipient[];
  };
  errorMessage?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeProviderMessage(message: string, apiKey: string) {
  return message.replaceAll(apiKey, '[redacted]').slice(0, 500);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return jsonResponse({ error: 'Session expired' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !['dean_of_studies', 'headteacher', 'it'].includes(String(profile?.role))) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const apiUrl = (Deno.env.get('AFRICASTALKING_API_URL') || defaultApiUrl).trim();
  const username = Deno.env.get('AFRICASTALKING_USERNAME')?.trim();
  const apiKey = Deno.env.get('AFRICASTALKING_API_KEY')?.trim();

  if (!allowedApiUrls.has(apiUrl) || !username || !apiKey) {
    return jsonResponse({ error: 'SMS service not configured' }, 503);
  }

  let body: { to?: unknown; message?: unknown; campaign_id?: unknown };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (
    !Array.isArray(body.to) ||
    body.to.length === 0 ||
    body.to.length > 100 ||
    body.to.some((n) => typeof n !== 'string' || !/^\+[1-9]\d{7,14}$/.test(n))
  ) {
    return jsonResponse({ error: 'Invalid recipient list' }, 400);
  }

  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1600) {
    return jsonResponse({ error: 'Invalid message body' }, 400);
  }

  const recipientsToSend = [...new Set(body.to as string[])];

  const form = new URLSearchParams({
    username,
    to: recipientsToSend.join(','),
    message: body.message.trim(),
    bulkSMSMode: '1',
  });

  let providerResponse: Response;

  try {
    providerResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
  } catch (error) {
    console.error('Provider request failed:', error);
    return jsonResponse({ error: 'Provider unreachable' }, 502);
  }

  const responseText = await providerResponse.text();
  let providerData: AfricaTalkingResponse;

  try {
    providerData = JSON.parse(responseText);
  } catch {
    console.error('Invalid provider JSON:', responseText.slice(0, 500));
    return jsonResponse({ error: 'Invalid provider response' }, 502);
  }

  if (!providerResponse.ok) {
    const msg = safeProviderMessage(
      providerData.errorMessage || providerData.SMSMessageData?.Message || providerResponse.statusText,
      apiKey,
    );
    console.error('Provider error:', providerResponse.status, msg);
    return jsonResponse({ error: msg }, 502);
  }

  const providerMessage = providerData.SMSMessageData?.Message || '';
  const recipients = (providerData.SMSMessageData?.Recipients || []).map((r) => ({
    number: r.number || '',
    status: r.status === 'Success' || r.status === 'Sent' || r.status === 'Queued' ? 'Success' as const : 'Failed' as const,
    statusCode: Number(r.statusCode) || 0,
    cost: r.cost || '',
    messageId: r.messageId || '',
  }));

  if (recipients.length === 0) {
    return jsonResponse({ error: 'No recipient confirmation' }, 502);
  }

  const success = recipients.every((r) => r.status === 'Success');
  const totalCost = providerMessage.match(/Total Cost:\s*([^,\n]+)/)?.[1] || '';

  if (supabaseServiceKey && typeof body.campaign_id === 'string' && body.campaign_id) {
    try {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      await adminClient
        .from('notification_campaigns')
        .update({
          status: success ? 'Sent' : 'Failed',
          provider_response: providerData,
          sent_at: new Date().toISOString(),
        })
        .eq('id', body.campaign_id);
    } catch (e) {
      console.error('History update failed:', e);
    }
  }

  return jsonResponse({
    success,
    message: providerMessage,
    totalCost,
    recipients,
  });
});