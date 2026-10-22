import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type ReminderTarget = {
  period_id: string;
  period_name: string;
  official_date: string;
  recipient_email: string;
  recipient_name: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("MIDTERM_REMINDER_CRON_SECRET");
  const suppliedSecret = req.headers.get("x-cron-secret");

  if (!cronSecret || suppliedSecret !== cronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("MIDTERM_REMINDER_FROM_EMAIL");
  const schoolName =
    Deno.env.get("MIDTERM_SCHOOL_NAME") ?? "G.S Gacuba 2A";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    return json(
      { error: "Missing required environment configuration" },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // The database RPC must return only reminders that are due
    // and have not already been recorded as sent.
    const { data, error } = await supabase.rpc(
      "get_midterm_reminder_targets",
    );

    if (error) {
      console.error("Could not load reminder targets:", error.message);
      return json({ error: "Could not load reminder targets" }, 500);
    }

    const targets = (data ?? []) as ReminderTarget[];

    if (targets.length === 0) {
      return json({
        success: true,
        message: "No mid-term reminders are due.",
        sent: 0,
      });
    }

    // Group recipients by period so the dean receives one reminder
    // per period, even if the RPC returns duplicate rows.
    const grouped = new Map<string, ReminderTarget[]>();

    for (const target of targets) {
      if (
        !target.period_id ||
        !target.period_name ||
        !target.official_date ||
        !target.recipient_email?.includes("@")
      ) {
        console.warn("Skipping invalid reminder target.");
        continue;
      }

      const group = grouped.get(target.period_id) ?? [];

      if (
        !group.some(
          (item) =>
            item.recipient_email.toLowerCase() ===
            target.recipient_email.toLowerCase(),
        )
      ) {
        group.push(target);
      }

      grouped.set(target.period_id, group);
    }

    let sent = 0;
    let failed = 0;

    for (const [periodId, recipients] of grouped) {
      let periodSucceeded = true;

      for (const recipient of recipients) {
        const subject = `Reminder: ${recipient.period_name} is scheduled for today`;

        const textBody = [
          `Dear ${recipient.recipient_name || "Dean of Studies"},`,
          "",
          `This is a reminder that ${recipient.period_name} is scheduled for today (${recipient.official_date}).`,
          "",
          "Please sign in to the school system to review the marks and generate the mid-term reports when ready.",
          "",
          "Generating reports does not finalize the period. Finalization should be completed separately when the school confirms the marks are complete.",
          "",
          `Regards,`,
          `${schoolName} Administration`,
        ].join("\n");

        const htmlBody = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937;line-height:1.6">
            <h2 style="color:#166534">Mid-term reminder</h2>
            <p>Dear ${escapeHtml(recipient.recipient_name || "Dean of Studies")},</p>
            <p>This is a reminder that <strong>${escapeHtml(recipient.period_name)}</strong>
            is scheduled for today, ${escapeHtml(recipient.official_date)}.</p>
            <p>Please sign in to the school system to review marks and generate the mid-term reports when ready.</p>
            <p><strong>Note:</strong> Generating reports does not finalize the period.
            Finalization should be completed separately when the school confirms the marks are complete.</p>
            <p>Regards,<br/>${escapeHtml(schoolName)} Administration</p>
          </div>
        `;

        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${schoolName} <${fromEmail}>`,
              to: [recipient.recipient_email],
              subject,
              text: textBody,
              html: htmlBody,
            }),
          });

          if (!response.ok) {
            console.error(
              `Email provider rejected reminder (${response.status}).`,
            );
            failed++;
            periodSucceeded = false;
            continue;
          }

          sent++;
        } catch (error) {
          console.error("Reminder delivery failed:", error);
          failed++;
          periodSucceeded = false;
        }
      }

      // Only mark the period as sent if every intended recipient
      // received an accepted response from the email provider.
      if (periodSucceeded && recipients.length > 0) {
        const { error: markError } = await supabase.rpc(
          "mark_midterm_reminder_sent",
          { p_period_id: periodId },
        );

        if (markError) {
          console.error(
            "Email accepted but reminder tracking failed:",
            markError.message,
          );
          failed++;
        }
      }
    }

    return json({
      success: failed === 0,
      sent,
      failed,
      periodsProcessed: grouped.size,
    });
  } catch (error) {
    console.error("Unexpected reminder function error:", error);
    return json({ error: "Unexpected reminder failure" }, 500);
  }
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
