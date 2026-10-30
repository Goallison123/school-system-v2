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

const SCHOOL_NAME = "G.S Gacuba II A";

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
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function gradeFor(m: number) {
  if (m >= 80) return 'A';
  if (m >= 70) return 'B';
  if (m >= 60) return 'C';
  if (m >= 50) return 'D';
  return 'F';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return response("Method not allowed.", 405);

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (!/^[a-f0-9]{64}$/i.test(token)) return response("This download link is invalid or expired.", 404);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return response("Unable to prepare the download.", 500);

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const tokenHash = await hashToken(token);

    const { data: report, error } = await supabase
      .from("midterm_reports")
      .select("id, period_id, period, student_name, class_name, average, report_data, generated_at, access_token_expires_at, published_at")
      .eq("access_token_hash", tokenHash)
      .not("published_at", "is", null)
      .maybeSingle();

    if (error) {
      console.error("Report lookup failed:", error.message);
      return response("Unable to prepare the download.", 500);
    }
    if (!report) return response("This download link is invalid or expired.", 404);
    if (!report.access_token_expires_at || new Date(report.access_token_expires_at).getTime() <= Date.now()) {
      return response("This download link is invalid or expired.", 404);
    }

    // Fetch period info for name/date + all averages for position
    let periodName = safeText(report.period || "Mid-Term");
    let periodDate = report.generated_at ? new Date(report.generated_at).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB");
    let allAverages: number[] = [];

    if (report.period_id) {
      const [periodRes, reportsRes] = await Promise.all([
        supabase.from("midterm_periods").select("name, official_date").eq("id", report.period_id).maybeSingle(),
        supabase.from("midterm_reports").select("average").eq("period_id", report.period_id),
      ]);
      if (periodRes.data) {
        periodName = safeText(periodRes.data.name) || periodName;
        if (periodRes.data.official_date) periodDate = new Date(periodRes.data.official_date).toLocaleDateString("en-GB");
      }
      if (reportsRes.data) allAverages = reportsRes.data.map((r: any) => Number(r.average)).filter((n) => Number.isFinite(n));
    }

    const position = allAverages.length ? [...allAverages].sort((a, b) => b - a).indexOf(Number(report.average)) + 1 : 1;

    // --- PDF - Same as wireframe ---
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 42;
    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 50;

    const draw = (text: string, x: number, yy: number, size = 10, isBold = false, align: 'left' | 'center' = 'left') => {
      const txt = safeText(text);
      let drawX = x;
      if (align === 'center') {
        const width = (isBold ? bold : font).widthOfTextAtSize(txt, size);
        drawX = (pageWidth - width) / 2;
      }
      page.drawText(txt, {
        x: drawX,
        y: yy - size,
        size,
        font: isBold ? bold : font,
        color: rgb(0.13, 0.13, 0.13),
      });
    };

    // School name centered - as wireframe
    draw(SCHOOL_NAME, 0, y, 14, true, 'center');
    y -= 18;
    draw("Mid-term report Card", 0, y, 11, true, 'center');
    y -= 30;

    draw(`Student: ${report.student_name}`, margin, y, 10, false);
    draw(`Class: ${report.class_name}`, 350, y, 10, false);
    y -= 18;
    draw(`Assessment: ${periodName}`, margin, y, 10, false);
    y -= 18;
    draw(`Date: ${periodDate}`, margin, y, 10, false);
    y -= 28;

    // Table header - Subject | Marks /100 | Grade
    const rows = Array.isArray(report.report_data?.rows) ? report.report_data.rows : [];
    const tableLeft = margin;
    const tableRight = pageWidth - margin;
    const tableWidth = tableRight - tableLeft;
    const col1 = tableLeft;
    const col2 = tableLeft + tableWidth * 0.5;
    const col3 = tableLeft + tableWidth * 0.75;

    // Header box
    page.drawRectangle({ x: tableLeft, y: y - 18, width: tableWidth, height: 20, borderColor: rgb(0,0,0), borderWidth: 1 });
    page.drawLine({ start: { x: col2, y: y + 2 }, end: { x: col2, y: y - 18 }, thickness: 1, color: rgb(0,0,0) });
    page.drawLine({ start: { x: col3, y: y + 2 }, end: { x: col3, y: y - 18 }, thickness: 1, color: rgb(0,0,0) });

    draw("Subject", col1 + 6, y, 10, true);
    draw("Marks / 100", col2 + 6, y, 10, true);
    draw("Grade", col3 + 6, y, 10, true);
    y -= 20;

    // Rows
    for (const r of rows) {
      if (y < 120) {
        const newPg = pdf.addPage([pageWidth, pageHeight]);
        page = newPg;
        y = pageHeight - 50;
      }
      const h = 22;
      page.drawRectangle({ x: tableLeft, y: y - h + 2, width: tableWidth, height: h, borderColor: rgb(0,0,0), borderWidth: 1 });
      page.drawLine({ start: { x: col2, y: y + 2 }, end: { x: col2, y: y - h + 2 }, thickness: 1, color: rgb(0,0,0) });
      page.drawLine({ start: { x: col3, y: y + 2 }, end: { x: col3, y: y - h + 2 }, thickness: 1, color: rgb(0,0,0) });

      draw(String(r.subject ?? "-"), col1 + 6, y, 10, false);
      draw(String(r.mark ?? "-"), col2 + 6, y, 10, false);
      draw(String(r.grade ?? gradeFor(Number(r.mark)) ?? "-"), col3 + 6, y, 10, false);
      y -= h;
    }

    y -= 20;
    if (y < 100) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - 80;
    }

    // Position and Average - as wireframe bottom
    draw(`Position: ${position || "-"}`, margin, y, 11, false);
    draw(`Average: ${report.average != null ? Number(report.average).toFixed(1) + "%" : "-"}`, 350, y, 11, true);
    y -= 30;

    // Bottom border line and decision
    page.drawLine({ start: { x: margin, y: y + 20 }, end: { x: tableRight, y: y + 20 }, thickness: 1, color: rgb(0,0,0) });
    draw("Decision: _________________________", margin, y, 10, false);

    // Footer
    draw(`${SCHOOL_NAME} - Generated ${new Date().toLocaleDateString()}`, 0, 30, 7, false, 'center');

    const pdfBytes = await pdf.save();
    const safeName = safeText(report.student_name).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "student";

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}-midterm-report.pdf"`,
      },
    });
  } catch (e) {
    console.error("Report download failed:", e);
    return response("Unable to prepare the download.", 500);
  }
});