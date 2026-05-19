// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
// Daily role-based notification dispatcher.
// Sends in-app notifications for:
//  - Upcoming holidays (next 7 days) → all authenticated users
//  - Pending leave/posting requests → command tier (admin/oic/2ic/staff_officer/supervisor)
//  - Today's scheduled attendance shift → users on roster for today (if mappable)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const COMMAND_ROLES = ["admin", "oic", "2ic", "staff_officer", "supervisor"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isInternalCaller(req)) return unauthorizedResponse(corsHeaders);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const in7 = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const out = { holidays: 0, pendingApprovals: 0, errors: [] as string[] };

  try {
    // 1. Upcoming holidays (next 7 days) → broadcast to all profile users
    const { data: holidays } = await supabase
      .from("holidays")
      .select("id,name,date")
      .gte("date", todayISO)
      .lte("date", in7);

    if (holidays && holidays.length) {
      const { data: users } = await supabase.from("profiles").select("user_id").not("user_id", "is", null);
      const userIds = (users ?? []).map((u: any) => u.user_id).filter(Boolean);

      for (const h of holidays) {
        // Skip if any user already got it today (idempotency by reference_id)
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("reference_id", h.id)
          .eq("type", "general")
          .gte("created_at", todayISO)
          .limit(1);
        if (existing && existing.length) continue;

        const rows = userIds.map((uid: string) => ({
          user_id: uid,
          title: `Upcoming Holiday: ${h.name}`,
          message: `${h.name} falls on ${h.date}. Please plan accordingly.`,
          type: "general",
          reference_id: h.id,
        }));
        for (let i = 0; i < rows.length; i += 50) {
          const { error } = await supabase.from("notifications").insert(rows.slice(i, i + 50));
          if (error) out.errors.push(`holiday: ${error.message}`);
        }
        out.holidays += rows.length;
      }
    }

    // 2. Pending approvals → command tier
    const { data: pendingLeave } = await supabase
      .from("leave_requests").select("id").eq("status", "pending");
    const { data: pendingPosting } = await supabase
      .from("postings_transfers").select("id").eq("status", "pending");

    const totalPending = (pendingLeave?.length ?? 0) + (pendingPosting?.length ?? 0);
    if (totalPending > 0) {
      const { data: roles } = await supabase
        .from("user_roles").select("user_id").in("role", COMMAND_ROLES);
      const commandUserIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));

      // Idempotency: one daily digest per user
      const refKey = `digest-${todayISO}`;
      for (const uid of commandUserIds) {
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", uid)
          .eq("title", "Daily Approvals Digest")
          .gte("created_at", todayISO)
          .limit(1);
        if (existing && existing.length) continue;

        const { error } = await supabase.from("notifications").insert({
          user_id: uid,
          title: "Daily Approvals Digest",
          message: `You have ${pendingLeave?.length ?? 0} leave and ${pendingPosting?.length ?? 0} posting/transfer request(s) awaiting review.`,
          type: "general",
          reference_id: null,
        });
        if (error) out.errors.push(`digest ${uid}: ${error.message}`);
        else out.pendingApprovals++;
      }
    }
  } catch (e: any) {
    out.errors.push(e.message ?? String(e));
  }

  return new Response(JSON.stringify(out), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
