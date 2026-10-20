
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
};

function response(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\x20-\xFF]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return response("Method not allowed.", 405);
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";

    // Tokens must be securely generated, high-entropy secrets.
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return response("This download link is invalid or expired.", 404);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("Required Supabase environment variables are missing.");
      return response("Unable to prepare the download.", 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const tokenHash = await hashToken(token);

    const { data: report, error } = await supabase
      .from("midterm_reports")
      .select(
        "id, period, student_name, class_name, average, report_data, generated_at, access_token_expires_at, published_at",
      )
      .eq("access_token_hash", tokenHash)
      .not("published_at", "is", null)
      .maybeSingle();

    if (error) {
      console.error("Report lookup failed:", error.message);
      return response("Unable to prepare the download.", 500);
    }

    if (!report) {
      return response("This download link is invalid or expired.", 404);
    }

    if (
      !report.access_token_expires_at ||
      new Date(report.access_token_expires_at).getTime() <= Date.now()
    ) {
      return response("This download link is invalid or expired.", 404);
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 42;
    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 54;

    const drawText = (
      text: string,
      x: number,
      top: number,
      size = 10,
      isBold = false,
    ) => {
      page.drawText(safeText(text), {
        x,
        y: top - size,
        size,
        font: isBold ? bold : font,
        color: rgb(0.12, 0.16, 0.22),
        maxWidth: pageWidth - margin * 2,
      });
    };

    const newPage = () => {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - 48;
    };

    drawText("G.S. GACUBA 2A", margin, y, 19, true);
    y -= 30;
    drawText("MID-TERM STUDENT REPORT", margin, y, 13, true);
    y -= 30;

    drawText(`Student: ${report.student_name}`, margin, y, 11, true);
    y -= 19;
    drawText(`Class: ${report.class_name}`, margin, y);
    y -= 17;
    drawText(`Assessment: ${report.period}`, margin, y);
    y -= 17;
    drawText(
      `Generated: ${report.generated_at ? new Date(report.generated_at).toLocaleDateString("en-GB", { timeZone: "UTC" }) : new Date().toLocaleDateString("en-GB")}`,
      margin,
      y,
    );
    y -= 30;

    const rows = Array.isArray(report.report_data?.rows)
      ? report.report_data.rows
      : [];

    const colX = [margin, 300, 390, 475];
    const headers = ["Subject", "Mark", "Grade", ""];

    page.drawRectangle({
      x: margin,
      y: y - 7,
      width: pageWidth - margin * 2,
      height: 23,
      color: rgb(0.91, 0.94, 0.97),
    });

    headers.slice(0, 3).forEach((header, index) => {
      drawText(header, colX[index], y + 4, 10, true);
    });

    y -= 20;

    for (const row of rows) {
      if (y < 85) newPage();

      drawText(String(row.subject ?? "—"), colX[0], y, 9);
      drawText(String(row.mark ?? "—"), colX[1], y, 9);
      drawText(String(row.grade ?? "—"), colX[2], y, 9);

      page.drawLine({
        start: { x: margin, y: y - 5 },
        end: { x: pageWidth - margin, y: y - 5 },
        thickness: 0.5,
        color: rgb(0.86, 0.88, 0.9),
      });

      y -= 22;
    }

    if (y < 100) newPage();

    y -= 12;
    drawText(
      `Overall average: ${report.average ?? "—"}`,
      margin,
      y,
      12,
      true,
    );

    y -= 34;
    drawText("Please contact the school if you have questions about this report.", margin, y, 9);

    const pdfBytes = await pdf.save();
    const safeName = safeText(report.student_name)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60) || "student";

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}-midterm-report.pdf"`,
      },
    });
  } catch (error) {
    console.error("Report download failed:", error);
    return response("Unable to prepare the download.", 500);
  }
});
