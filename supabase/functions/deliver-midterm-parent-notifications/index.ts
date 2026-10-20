
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  const apiUrl = Deno.env.get("AFRICASTALKING_API_URL");

  if (!url || !anonKey || !serviceKey || !apiKey || !username || !apiUrl) {
    return json({ error: "Missing server configuration" }, 500);
  }

  const cronSecret = Deno.env.get("MIDTERM_SMS_CRON_SECRET");
const suppliedCronSecret = req.headers.get("x-cron-secret");

const isCronRequest =
  !!cronSecret && suppliedCronSecret === cronSecret;

const authorization = req.headers.get("Authorization");

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (!isCronRequest && !authorization) {
  return json({ error: "Authentication required" }, 401);
}

 if (!isCronRequest) {
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authError } = await authClient.auth.getUser();
  if (authError || !userData.user) return json({ error: "Unauthorized" }, 401);
 
  const { data: profile, error: profileError } = await db
    .from("users")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    !["dean_of_studies", "headteacher", "it"].includes(profile.role)
  ) {
    return json({ error: "Insufficient permissions" }, 403);
  }
 }
  let limit = 10;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.limit !== undefined) {
      limit = Math.max(1, Math.min(10, Number(body.limit) || 10));
    }
  } catch {
    // Use the default batch size.
  }

  const { data: pending, error: fetchError } = await db
    .from("midterm_parent_notification_queue")
    .select("id, recipient, payload, attempts")
    .eq("channel", "sms")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchError) return json({ error: "Could not load queue" }, 500);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of pending ?? []) {
    // Claim this item before sending, to reduce duplicate processing.
    const { data: claimed, error: claimError } = await db
      .from("midterm_parent_notification_queue")
      .update({
        status: "processing",
        attempts: (item.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError || !claimed) {
      skipped++;
      continue;
    }

    const phone = String(item.recipient ?? "").trim();
    const message = String(item.payload?.message ?? "").trim();
    const downloadUrl = String(item.payload?.download_url ?? "").trim();

    if (
      !/^\+[1-9]\d{7,14}$/.test(phone) ||
      !message ||
      !/^https:\/\/\S+$/.test(downloadUrl) ||
      !message.includes(downloadUrl)
    ) {
      await db
        .from("midterm_parent_notification_queue")
        .update({
          status: "failed",
          last_error: "Invalid phone number or missing/invalid report link",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      failed++;
      continue;
    }

    try {
      const form = new URLSearchParams({
        username,
        to: phone,
        message,
      });

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          apiKey,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });

      const result = await response.json().catch(() => ({}));
      const recipients = result?.SMSMessageData?.Recipients ?? [];
      const recipientResult = recipients.find(
        (r: { number?: string }) => r.number === phone,
      ) ?? (recipients.length === 1 ? recipients[0] : null);

      const accepted =
        response.ok &&
        recipientResult &&
        ["101", "102"].includes(String(recipientResult.statusCode));

      if (!accepted) {
        const reason =
          recipientResult?.status ??
          result?.SMSMessageData?.Message ??
          `Provider rejected message (HTTP ${response.status})`;

        await db
          .from("midterm_parent_notification_queue")
          .update({
            status: "failed",
            last_error: String(reason).slice(0, 1000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        failed++;
        continue;
      }

      const { error: updateError } = await db
        .from("midterm_parent_notification_queue")
        .update({
          status: "sent",
          provider_message_id: recipientResult.messageId ?? null,
          last_error: null,
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (updateError) {
        console.error("Accepted SMS but could not update queue:", item.id);
        failed++;
      } else {
        sent++;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Network error";

      await db
        .from("midterm_parent_notification_queue")
        .update({
          status: "failed",
          last_error: reason.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      failed++;
    }
  }

  return json({
    success: failed === 0,
    checked: pending?.length ?? 0,
    sent,
    failed,
    skipped,
  });
});
