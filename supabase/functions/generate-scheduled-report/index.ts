// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (!isInternalCaller(req)) return unauthorizedResponse(corsHeaders);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { report_type, frequency } = await req.json();

    if (!["staff", "attendance", "leave"].includes(report_type)) {
      return new Response(JSON.stringify({ error: "Invalid report_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Calculate date range based on frequency
    let startDate: string;
    const endDate = today;

    if (frequency === "daily") {
      startDate = today;
    } else if (frequency === "weekly") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString().split("T")[0];
    } else if (frequency === "quarterly") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split("T")[0];
    } else if (frequency === "annually") {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().split("T")[0];
    } else {
      // monthly (default fallback)
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      startDate = d.toISOString().split("T")[0];
    }

    // Fetch data based on report type
    let rows: string[][] = [];
    let headers: string[] = [];
    let title = "";

    if (report_type === "staff") {
      const { data: staff } = await supabase
        .from("profiles")
        .select("*, ranks(name, abbreviation), departments(name)")
        .order("last_name");

      title = "Staff Summary Report";
      headers = ["Staff ID", "Last Name", "First Name", "Rank", "Department", "Unit", "Shift", "Gender", "Status", "Phone"];
      rows = (staff || []).map((s: any) => [
        s.staff_id, s.last_name, s.first_name,
        s.ranks?.abbreviation ?? "—", s.departments?.name ?? "—",
        s.unit ?? "—", s.shift_group ?? "—", s.gender ?? "—",
        s.status, s.phone ?? "—",
      ]);
    } else if (report_type === "attendance") {
      const { data: attendance } = await supabase
        .from("attendances")
        .select("*, profiles(first_name, last_name, staff_id)")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      title = `Attendance Report (${startDate} to ${endDate})`;
      headers = ["Date", "Staff ID", "Name", "Check In", "Check Out", "Status", "Notes"];
      rows = (attendance || []).map((a: any) => [
        a.date, a.profiles?.staff_id ?? "—",
        `${a.profiles?.last_name ?? ""}, ${a.profiles?.first_name ?? ""}`,
        a.check_in ? new Date(a.check_in).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—",
        a.check_out ? new Date(a.check_out).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—",
        a.status, a.notes ?? "",
      ]);
    } else if (report_type === "leave") {
      const { data: leave } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_profile_id_fkey(first_name, last_name, staff_id)")
        .lte("start_date", endDate)
        .gte("end_date", startDate)
        .order("created_at", { ascending: false });

      title = `Leave/Pass Report (${startDate} to ${endDate})`;
      headers = ["Staff ID", "Name", "Type", "Start Date", "End Date", "Status", "Reason"];
      rows = (leave || []).map((l: any) => [
        l.profiles?.staff_id ?? "—",
        `${l.profiles?.last_name ?? ""}, ${l.profiles?.first_name ?? ""}`,
        l.type, l.start_date, l.end_date, l.status, l.reason ?? "",
      ]);
    }

    // Generate CSV content (lightweight server-side format)
    const csvHeader = headers.join(",");
    const csvRows = rows.map((r) =>
      r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    );
    const csvContent = [csvHeader, ...csvRows].join("\n");
    const csvBlob = new TextEncoder().encode(csvContent);

    // Build file name
    const freqLabel = frequency.charAt(0).toUpperCase() + frequency.slice(1);
    const typeLabel = report_type === "staff" ? "Staff_Summary" :
      report_type === "attendance" ? "Attendance" : "Leave_Pass";
    const fileName = `Auto_${freqLabel}_${typeLabel}_${today}.csv`;
    const filePath = `scheduled/${fileName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("reports")
      .upload(filePath, csvBlob, {
        contentType: "text/csv",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload report", details: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save to report_uploads table — auto-generated reports start as pending approval
    const { error: insertError } = await supabase.from("report_uploads").insert({
      title: `${freqLabel} ${typeLabel.replace(/_/g, " ")} Report`,
      description: `Auto-generated ${frequency} report for ${startDate} to ${endDate}`,
      category: frequency,
      file_path: filePath,
      file_name: fileName,
      file_type: "text/csv",
      file_size: csvBlob.length,
      uploaded_by: "00000000-0000-0000-0000-000000000000",
      submitted_by: "00000000-0000-0000-0000-000000000000",
      report_date: today,
      source: "scheduled",
      approval_status: "pending",
    });

    if (insertError) {
      console.error("Insert error:", insertError);
    }

    // Update schedule last_run_at and next_run_at
    const nextRun = new Date(now);
    if (frequency === "daily") {
      nextRun.setDate(nextRun.getDate() + 1);
    } else if (frequency === "weekly") {
      nextRun.setDate(nextRun.getDate() + 7);
    } else if (frequency === "quarterly") {
      nextRun.setMonth(nextRun.getMonth() + 3);
    } else if (frequency === "annually") {
      nextRun.setFullYear(nextRun.getFullYear() + 1);
    } else {
      nextRun.setMonth(nextRun.getMonth() + 1);
    }

    await supabase
      .from("report_schedules")
      .update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() })
      .eq("report_type", report_type)
      .eq("frequency", frequency);

    // Send in-app notifications to admins and supervisors
    const notifTitle = `${freqLabel} ${typeLabel.replace(/_/g, " ")} Report Ready`;
    const notifMessage = `Auto-generated ${frequency} ${typeLabel.replace(/_/g, " ").toLowerCase()} report is ready with ${rows.length} records. View it in Uploaded Reports.`;

    const { data: notifUsers } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "supervisor"]);

    if (notifUsers && notifUsers.length > 0) {
      const notifications = notifUsers.map((u: any) => ({
        user_id: u.user_id,
        title: notifTitle,
        message: notifMessage,
        type: "general",
      }));
      const { error: notifError } = await supabase.from("notifications").insert(notifications);
      if (notifError) console.error("Notification error:", notifError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${freqLabel} ${typeLabel} report generated`,
        file: fileName,
        records: rows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
