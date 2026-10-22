
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const defaultApiUrl =
     // 'https://api.africastalking.com/version1/messaging'
  'https://api.sandbox.africastalking.com/version1/messaging';

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
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
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
    return jsonResponse(
      { error: 'Use POST to send a text message.' },
      405,
    );
  }

  // Authenticate the signed-in Supabase user.
  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (
    !authorization?.startsWith('Bearer ') ||
    !supabaseUrl ||
    !supabaseAnonKey
  ) {
    return jsonResponse(
      { error: 'Sign in with an authorized school account to send messages.' },
      401,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authData.user) {
    return jsonResponse(
      { error: 'Your sign-in has expired. Sign in again to send messages.' },
      401,
    );
  }

  // Only approved school roles can send SMS.
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (
    profileError ||
    !['dean_of_studies', 'headteacher', 'it'].includes(
      String(profile?.role),
    )
  ) {
    return jsonResponse(
      { error: 'Your school account can’t send text messages.' },
      403,
    );
  }

  // Read the Africa's Talking credentials from server-side secrets.
  const apiUrl = (
    Deno.env.get('AFRICASTALKING_API_URL') || defaultApiUrl
  ).trim();

  const username = Deno.env
    .get('AFRICASTALKING_USERNAME')
    ?.trim();

  const apiKey = Deno.env
    .get('AFRICASTALKING_API_KEY')
    ?.trim();

  if (!allowedApiUrls.has(apiUrl) || !username || !apiKey) {
    return jsonResponse(
      {
        error:
          'Text messaging is not ready. Ask the school administrator to diagnose the platform.',
      },
      503,
    );
  }

  // Read and validate the submitted message.
  let body: { to?: unknown; message?: unknown };

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { error: 'The message details could not be read.' },
      400,
    );
  }

  if (
    !Array.isArray(body.to) ||
    body.to.length === 0 ||
    body.to.length > 100 ||
    body.to.some(
      (number) =>
        typeof number !== 'string' ||
        !/^\+[1-9]\d{7,14}$/.test(number),
    )
  ) {
    return jsonResponse(
      {
        error:
          'Add between 1 and 100 valid international phone numbers.',
      },
      400,
    );
  }

  if (
    typeof body.message !== 'string' ||
    !body.message.trim() ||
    body.message.length > 1600
  ) {
    return jsonResponse(
      { error: 'Write a message of 1 to 1,600 characters.' },
      400,
    );
  }

  // Remove duplicate numbers before contacting the provider.
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
    console.error('Africa’s Talking request failed:', error);

    return jsonResponse(
      {
        error:
          'Could not reach the SMS service. Check the server connection and try again.',
      },
      502,
    );
  }

  const responseText = await providerResponse.text();
  let providerData: AfricaTalkingResponse;

  try {
    providerData = JSON.parse(responseText);
  } catch {
    const message = safeProviderMessage(
      responseText || providerResponse.statusText,
      apiKey,
    );

    console.error(
      'Africa’s Talking returned an unreadable response:',
      providerResponse.status,
      message,
    );

    return jsonResponse(
      {
        error:
          'The SMS service returned an unreadable response. Check its server settings.',
      },
      502,
    );
  }

  if (!providerResponse.ok) {
    const message = safeProviderMessage(
      providerData.errorMessage ||
        providerData.SMSMessageData?.Message ||
        providerResponse.statusText,
      apiKey,
    );

    console.error(
      'Africa’s Talking rejected the SMS request:',
      providerResponse.status,
      message,
    );

    return jsonResponse(
      {
        error: `Africa’s Talking could not send the message: ${message}`,
      },
      502,
    );
  }

  const providerMessage =
    providerData.SMSMessageData?.Message || '';

  const recipients = (
    providerData.SMSMessageData?.Recipients || []
  ).map((recipient) => ({
    number: recipient.number || '',
    status:
      recipient.status === 'Success'
        ? 'Success' as const
        : recipient.status === 'Queued'
          ? 'Queued' as const
          : 'Failed' as const,
    statusCode: Number(recipient.statusCode) || 0,
    cost: recipient.cost || '',
    messageId: recipient.messageId || '',
  }));

  if (recipients.length === 0) {
    console.error(
      'Africa’s Talking response contained no recipient results.',
    );

    return jsonResponse(
      {
        error:
          'The SMS service did not confirm any recipients. Check the provider response.',
      },
      502,
    );
  }

  const success = recipients.every(
    (recipient) =>
      recipient.status === 'Success' ||
      recipient.status === 'Queued',
  );

  const totalCost =
    providerMessage.match(/Total Cost:\s*([^,\n]+)/)?.[1] || '';

  return jsonResponse({
    success,
    message: success
      ? providerMessage
      : 'Some messages could not be sent. Check the delivery results.',
    totalCost,
    recipients,
  });
});
