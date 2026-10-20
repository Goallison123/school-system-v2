
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceKey || !anonKey) {
      console.error("Required Supabase environment variables are missing.");
      return json({ error: "Server configuration error." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Authentication required." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } =
      await userClient.auth.getUser();

    if (authError || !authData.user) {
      return json({ error: "Your session is invalid or expired." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: user, error: userError } = await admin
      .from("users")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (userError) {
      console.error("Role lookup failed:", userError.message);
      return json({ error: "Unable to verify permissions." }, 500);
    }

    if (!user || user.role !== "dean_of_studies") {
      return json({ error: "You are not authorized to publish reports." }, 403);
    }

    const body = await req.json();
    const reportIds = Array.isArray(body.report_ids)
      ? [...new Set(body.report_ids.filter(
          (id: unknown) => typeof id === "string",
        ))]
      : [];

    if (reportIds.length === 0 || reportIds.length > 200) {
      return json({ error: "Provide between 1 and 200 report IDs." }, 400);
    }

    const { data: reports, error: reportsError } = await admin
      .from("midterm_reports")
      .select("id, student_name, period, access_token_hash")
      .in("id", reportIds)
      .eq("is_deleted", false);

    if (reportsError) {
      console.error("Report lookup failed:", reportsError.message);
      return json({ error: "Unable to load reports." }, 500);
    }

    if (!reports || reports.length !== reportIds.length) {
      return json({ error: "One or more reports were not found." }, 404);
    }

    const results: Array<{
      report_id: string;
      links_queued: number;
    }> = [];

    for (const report of reports) {
      const { data: contacts, error: contactsError } = await admin
        .from("midterm_report_contacts")
        .select("parent_name, phone, email")
        .eq("report_id", report.id);

      if (contactsError) {
        console.error("Parent contact lookup failed:", contactsError.message);
        return json({ error: "Unable to load parent contacts." }, 500);
      }

      const recipients = new Map<string, "email" | "sms">();

      for (const contact of contacts ?? []) {
        const email = String(contact.email ?? "").trim();
        const phone = String(contact.phone ?? "").trim();

        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          recipients.set(`email:${email}`, "email");
        }

        if (phone) {
          recipients.set(`sms:${phone}`, "sms");
        }
      }

      if (recipients.size === 0) {
        results.push({ report_id: report.id, links_queued: 0 });
        continue;
      }

      // Reuse a still-valid token so retrying does not invalidate
      // a link already sent to a parent.
      let token: string | null = null;
      let tokenHash = report.access_token_hash;

      const { data: currentReport, error: currentError } = await admin
        .from("midterm_reports")
        .select("access_token_expires_at, published_at")
        .eq("id", report.id)
        .single();

      if (currentError) {
        console.error("Token status lookup failed:", currentError.message);
        return json({ error: "Unable to check existing links." }, 500);
      }

      // A hash cannot be converted back into its original token.
      // If no raw token is available, issue a new one and update the hash.
      const expiresAt = currentReport.access_token_expires_at
        ? new Date(currentReport.access_token_expires_at).getTime()
        : 0;

      if (!currentReport.published_at || expiresAt <= Date.now()) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        token = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        tokenHash = await sha256(token);

        const expiry = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { error: updateError } = await admin
          .from("midterm_reports")
          .update({
            access_token_hash: tokenHash,
            access_token_expires_at: expiry,
            published_at: new Date().toISOString(),
          })
          .eq("id", report.id);

        if (updateError) {
          console.error("Token update failed:", updateError.message);
          return json({ error: "Unable to publish a report." }, 500);
        }
      } else {
        // Existing hash is valid, but the original token is intentionally
        // unrecoverable. Don't queue a broken link or silently rotate it.
        const { data: pending } = await admin
          .from("midterm_parent_notification_queue")
          .select("recipient, channel, payload")
          .eq("report_id", report.id)
          .in("status", ["pending", "processing", "failed"]);

        const queuedForReport = (pending ?? []).filter((item) =>
          typeof item.payload?.download_url === "string"
        ).length;

        if (queuedForReport > 0) {
          results.push({
            report_id: report.id,
            links_queued: queuedForReport,
          });
          continue;
        }

        return json({
          error:
            "A link was previously issued, but its original token is unavailable. Revoke that link before issuing a replacement.",
          report_id: report.id,
        }, 409);
      }

      const downloadUrl =
        `${supabaseUrl}/functions/v1/download-midterm-report?token=${token}`;

      let linksQueued = 0;

      for (const [key, channel] of recipients) {
        const recipient = key.slice(channel.length + 1);

        const message = channel === "email"
          ? `Your student's ${report.period} report is ready. Download it securely here: ${downloadUrl}`
          : `School report ready (${report.period}). Download securely: ${downloadUrl}`;

        const { error: queueError } = await admin
          .from("midterm_parent_notification_queue")
          .upsert({
            report_id: report.id,
            channel,
            recipient,
            payload: {
              message,
              download_url: downloadUrl,
              student_name: report.student_name,
              period: report.period,
            },
            status: "pending",
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "report_id,channel,recipient",
          });

        if (queueError) {
          console.error("Queue insert failed:", queueError.message);
          return json({ error: "Unable to queue parent notifications." }, 500);
        }

        linksQueued++;
      }

      results.push({
        report_id: report.id,
        links_queued: linksQueued,
      });
    }

    return json({ success: true, results });
  } catch (error) {
    console.error("Issue-links function failed:", error);
    return json({ error: "Unable to issue report links." }, 500);
  }
});
