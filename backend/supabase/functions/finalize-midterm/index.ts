
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl = Deno.env.get("PUBLIC_APP_URL");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) {
    console.error("Missing required finalization function secrets.");
    return jsonResponse(
      { error: "Server configuration is incomplete." },
      500,
    );
  }

  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  const accessToken = authorization.slice("Bearer ".length).trim();

  if (!accessToken) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  let body: { periodId?: string };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const periodId = body.periodId;

  if (
    typeof periodId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(periodId)
  ) {
    return jsonResponse({ error: "A valid periodId is required." }, 400);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } =
    await authClient.auth.getUser(accessToken);

  if (authError || !authData.user) {
    return jsonResponse({ error: "Your session is invalid or expired." }, 401);
  }

  const actorId = authData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRecord, error: roleError } = await admin
    .from("users")
    .select("role")
    .eq("id", actorId)
    .maybeSingle();

  if (roleError) {
    console.error("Role lookup failed:", roleError.message);
    return jsonResponse({ error: "Could not verify your school role." }, 500);
  }

  if (userRecord?.role !== "dean_of_studies") {
    return jsonResponse(
      { error: "Only the dean of studies can finalize a mid-term." },
      403,
    );
  }

  const baseUrl = appUrl.replace(/\/+$/, "");
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const { data: reports, error: reportsError } = await admin
      .from("midterm_reports")
      .select("id, period_id, is_deleted")
      .eq("period_id", periodId)
      .eq("is_deleted", false);

    if (reportsError) {
      console.error("Report lookup failed:", reportsError.message);
      return jsonResponse({ error: "Could not load mid-term reports." }, 500);
    }

    if (!reports?.length) {
      return jsonResponse(
        { error: "No reports exist for this mid-term." },
        422,
      );
    }

    const tokens = await Promise.all(
      reports.map(async (report) => {
        const rawToken = randomToken();
        const tokenHash = await sha256(rawToken);

        const url = new URL(`${baseUrl}/parent-report`);
        url.searchParams.set("token", rawToken);

        return {
          report_id: report.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          url: url.toString(),
        };
      }),
    );

    const { data: result, error: finalizeError } = await admin.rpc(
      "finalize_midterm_secure",
      {
        p_period_id: periodId,
        p_actor_id: actorId,
        p_tokens: tokens,
      },
    );

    if (finalizeError) {
      console.error("Finalization rejected:", finalizeError.message);

      return jsonResponse(
        {
          error: finalizeError.message ||
            "The mid-term could not be finalized.",
        },
        422,
      );
    }

    return jsonResponse({
      success: true,
      result,
      message:
        "Mid-term finalized. Notifications are queued, not necessarily sent.",
    });
  } catch (error) {
    console.error(
      "Unexpected finalization error:",
      error instanceof Error ? error.message : error,
    );

    return jsonResponse(
      { error: "An unexpected error occurred during finalization." },
      500,
    );
  }
});
