// Attendance Compliance Report — generates weekly/monthly compliance summary
// and emails it as a PDF attachment via the Resend connector. Designed to be
// invoked manually from the Reports UI ("Send now") and from a pg_cron job.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";
import { isInternalCaller } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

type Period = "weekly" | "monthly";

interface Body {
  period: Period;
  reference_date?: string; // optional ISO yyyy-mm-dd; defaults to today
  dry_run?: boolean;       // generates + audits but skips delivery
  recipients?: string[];   // optional override; otherwise pulled from table
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeekMon(d: Date) {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7; // Mon=0
  x.setUTCDate(x.getUTCDate() - day);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfWeekMon(d: Date) {
  const s = startOfWeekMon(d);
  const e = new Date(s);
  e.setUTCDate(s.getUTCDate() + 6);
  return e;
}

function periodRange(period: Period, ref: Date): { from: Date; to: Date } {
  if (period === "weekly") {
    return { from: startOfWeekMon(ref), to: endOfWeekMon(ref) };
  }
  const from = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const to = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
  return { from, to };
}

function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const c = new Date(from);
  while (c <= to) {
    out.push(new Date(c));
    c.setUTCDate(c.getUTCDate() + 1);
  }
  return out;
}

function isWeekendUtc(d: Date) {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body?.period || !["weekly", "monthly"].includes(body.period)) {
      return new Response(JSON.stringify({ error: "period must be 'weekly' or 'monthly'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const isDryRun = body.dry_run === true;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const ref = body.reference_date ? new Date(body.reference_date + "T00:00:00Z") : new Date();
    const { from, to } = periodRange(body.period, ref);
    const fromIso = isoDate(from);
    const toIso = isoDate(to);

    // Recipients
    let recipients: string[] = [];
    if (Array.isArray(body.recipients) && body.recipients.length) {
      recipients = body.recipients.filter(isValidEmail);
    } else {
      const { data } = await supabase
        .from("attendance_report_recipients")
        .select("email")
        .eq("period", body.period);
      recipients = (data ?? []).map((r: any) => r.email).filter(isValidEmail);
    }

    if (recipients.length === 0 && !isDryRun) {
      return new Response(JSON.stringify({ error: "No recipients configured for this period" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compliance dataset
    const [profilesRes, attRes, leaveRes, holRes] = await Promise.all([
      supabase.from("profiles").select("id, staff_id, first_name, last_name, shift_group, office, departments(name)").eq("status", "active"),
      supabase.from("attendances").select("profile_id, date, status").gte("date", fromIso).lte("date", toIso),
      supabase.from("leave_requests").select("profile_id, start_date, end_date").eq("status", "approved").lte("start_date", toIso).gte("end_date", fromIso),
      supabase.from("holidays").select("date").gte("date", fromIso).lte("date", toIso),
    ]);

    const profiles = profilesRes.data ?? [];
    const attendances = attRes.data ?? [];
    const leaves = leaveRes.data ?? [];
    const holidays = new Set((holRes.data ?? []).map((h: any) => h.date as string));

    const workingDays = eachDay(from, to).filter((d) => !isWeekendUtc(d) && !holidays.has(isoDate(d)));

    const rows = profiles.map((p: any) => {
      const att = new Map<string, any>();
      attendances.filter((a: any) => a.profile_id === p.id).forEach((a: any) => att.set(a.date, a));
      const lvs = leaves.filter((l: any) => l.profile_id === p.id);
      let present = 0, absent = 0, late = 0, leave = 0;
      for (const d of workingDays) {
        const iso = isoDate(d);
        const onLeave = lvs.some((l: any) => iso >= l.start_date && iso <= l.end_date);
        if (onLeave) { leave++; continue; }
        const a = att.get(iso);
        if (!a) { absent++; continue; }
        if (a.status === "present") present++;
        else if (a.status === "late") { present++; late++; }
        else if (a.status === "leave" || a.status === "on_leave") leave++;
        else absent++;
      }
      const expected = workingDays.length;
      const rate = expected > 0 ? (present / expected) * 100 : 0;
      return {
        staff_id: p.staff_id,
        name: `${p.last_name}, ${p.first_name}`,
        department: p.departments?.name ?? "—",
        office: p.office ?? "—",
        shift: p.shift_group ?? "—",
        present, absent, late, leave, expected, rate,
      };
    }).sort((a, b) => a.rate - b.rate);

    const totals = rows.reduce((acc, r) => ({
      expected: acc.expected + r.expected,
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      late: acc.late + r.late,
    }), { expected: 0, present: 0, absent: 0, late: 0 });
    const overallRate = totals.expected > 0 ? (totals.present / totals.expected) * 100 : 0;

    // Build PDF
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.setTextColor(0, 102, 153);
    doc.text("GIS Amasaman Sector Command", 14, 15);
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text(`Attendance Compliance — ${body.period === "weekly" ? "Weekly" : "Monthly"}`, 14, 23);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Period: ${fromIso} to ${toIso} | Working days: ${workingDays.length} | Staff: ${rows.length} | Overall: ${overallRate.toFixed(1)}%`, 14, 29);

    autoTable(doc, {
      head: [["Staff ID", "Name", "Department", "Office", "Shift", "Working", "Present", "Absent", "Late", "Leave", "Compliance %"]],
      body: rows.map((r) => [
        r.staff_id, r.name, r.department, r.office, r.shift,
        String(r.expected), String(r.present), String(r.absent),
        String(r.late), String(r.leave), `${r.rate.toFixed(1)}%`,
      ]),
      startY: 34,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [0, 102, 153], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [240, 248, 255] },
      margin: { left: 10, right: 10 },
    });

    const pdfBytes = doc.output("arraybuffer");
    const pdfBytesU8 = new Uint8Array(pdfBytes);
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < pdfBytesU8.length; i += CHUNK) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(pdfBytesU8.subarray(i, Math.min(i + CHUNK, pdfBytesU8.length))),
      );
    }
    const pdfBase64 = btoa(binary);
    const filename = `attendance_compliance_${body.period}_${fromIso}_to_${toIso}.pdf`;

    // Send via Resend
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const sendResults: { email: string; status: string; message_id?: string; error?: string }[] = [];

    if (isDryRun) {
      for (const r of recipients) sendResults.push({ email: r, status: "simulated", message_id: `test_${crypto.randomUUID()}` });
    } else if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email connector not configured. Connect Resend in Cloud → Connectors." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      const subject = `Attendance Compliance — ${body.period} (${fromIso} to ${toIso})`;
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2 style="color:#006699;margin:0 0 8px">Attendance Compliance Summary</h2>
        <p>Period: <strong>${fromIso}</strong> to <strong>${toIso}</strong></p>
        <ul>
          <li>Staff covered: <strong>${rows.length}</strong></li>
          <li>Working days: <strong>${workingDays.length}</strong></li>
          <li>Overall compliance: <strong>${overallRate.toFixed(1)}%</strong></li>
          <li>Total absences: <strong>${totals.absent}</strong></li>
          <li>Late arrivals: <strong>${totals.late}</strong></li>
        </ul>
        <p>Full breakdown attached.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
        <p style="font-size:12px;color:#64748b">Ghana Immigration Service — Amasaman Sector Command · Cybernet</p>
      </div>`;

      for (const recipient of recipients) {
        try {
          const resp = await fetch(`${GATEWAY_URL}/emails`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": RESEND_API_KEY,
            },
            body: JSON.stringify({
              from: "Ghana Immigration Service <onboarding@resend.dev>",
              to: [recipient],
              subject,
              html,
              attachments: [{ filename, content: pdfBase64 }],
            }),
          });
          const txt = await resp.text();
          let parsed: any = null;
          try { parsed = JSON.parse(txt); } catch { /* ignore */ }
          if (!resp.ok) {
            sendResults.push({ email: recipient, status: "failed", error: `[${resp.status}] ${parsed?.error?.message || txt.slice(0, 200)}` });
          } else {
            sendResults.push({ email: recipient, status: "sent", message_id: parsed?.id });
          }
        } catch (e) {
          sendResults.push({ email: recipient, status: "failed", error: e instanceof Error ? e.message : "network error" });
        }
      }
    }

    const sent = sendResults.filter((r) => r.status === "sent").length;
    const failed = sendResults.filter((r) => r.status === "failed").length;

    // Audit log entry
    try {
      await supabase.from("front_desk_audit_log").insert({
        action: isDryRun ? "attendance_compliance_test" : "attendance_compliance_sent",
        entity_type: "attendance_compliance_report",
        entity_id: "00000000-0000-0000-0000-000000000000",
        performed_by: "00000000-0000-0000-0000-000000000000",
        details: {
          test_mode: isDryRun,
          source: "edge_function",
          period: body.period,
          from: fromIso,
          to: toIso,
          working_days: workingDays.length,
          staff_count: rows.length,
          overall_rate: Number(overallRate.toFixed(2)),
          totals,
          attachment_filename: filename,
          recipients_count: recipients.length,
          sent, failed,
          results: sendResults,
        },
      });
    } catch (_e) { /* best effort */ }

    return new Response(JSON.stringify({
      success: failed === 0,
      dry_run: isDryRun,
      summary: { recipients: recipients.length, sent, failed, staff: rows.length, overall_rate: Number(overallRate.toFixed(2)) },
      results: sendResults,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("attendance-compliance-report failure", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
