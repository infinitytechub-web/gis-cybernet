// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
// Interlink scheduled dispatch runner.
// Invoked by pg_cron every minute. For every active schedule whose
// next_run_at <= now() it creates a DRAFT interlink_dispatches row in the
// configured workflow state, logs an immutable approval action, then
// recomputes next_run_at.
//
// This function does NOT send email. The actual send happens after a human
// approver moves the dispatch to "approved" in the UI (handled by the existing
// send-record-email flow). Pre-approved schedules (requires_per_run_approval =
// false) jump straight to "approved" so the UI's bulk send picks them up.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface ScheduleRow {
  id: string;
  name: string;
  scope: string;
  report_kind: string;
  subject_template: string;
  message_template: string | null;
  attachment_rule_id: string | null;
  recipient_dept_ids: string[];
  recipient_list_ids: string[];
  recipient_contact_ids: string[];
  recipient_adhoc_emails: string[];
  reviewer_id: string | null;
  approver_id: string | null;
  requires_per_run_approval: boolean;
  created_by: string;
  frequency: string;
  run_time: string;
  day_of_week: number | null;
  day_of_month: number | null;
}

async function resolveRecipients(
  supabase: ReturnType<typeof createClient>,
  s: ScheduleRow,
): Promise<string[]> {
  const set = new Set<string>();

  // Departments → profile emails
  if (s.recipient_dept_ids.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("email, department_id")
      .in("department_id", s.recipient_dept_ids)
      .not("email", "is", null);
    (data ?? []).forEach((p: any) => p.email && set.add(p.email.toLowerCase()));
  }
  // Lists
  if (s.recipient_list_ids.length > 0) {
    const { data } = await supabase
      .from("interlink_lists")
      .select("member_emails")
      .in("id", s.recipient_list_ids);
    (data ?? []).forEach((l: any) =>
      (l.member_emails ?? []).forEach((e: string) => set.add(e.toLowerCase())),
    );
  }
  // Contacts
  if (s.recipient_contact_ids.length > 0) {
    const { data } = await supabase
      .from("interlink_contacts")
      .select("email")
      .in("id", s.recipient_contact_ids);
    (data ?? []).forEach((c: any) => c.email && set.add(c.email.toLowerCase()));
  }
  // Ad-hoc
  s.recipient_adhoc_emails.forEach((e) => e && set.add(e.toLowerCase()));

  return Array.from(set);
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!isInternalCaller(req)) return unauthorizedResponse(corsHeaders);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // Fetch due schedules
  const { data: due, error } = await supabase
    .from("interlink_schedules")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_at", now);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const processed: any[] = [];

  for (const s of (due ?? []) as ScheduleRow[]) {
    try {
      const recipients = await resolveRecipients(supabase, s);
      const vars = { kind: s.report_kind, date: today, scope: s.scope, name: s.name };
      const subject = fillTemplate(s.subject_template, vars);
      const message = s.message_template ? fillTemplate(s.message_template, vars) : null;

      const initialState = s.requires_per_run_approval ? "draft" : "approved";
      const initialStatus = s.requires_per_run_approval ? "draft" : "pending";

      const { data: dispatch, error: dErr } = await supabase
        .from("interlink_dispatches")
        .insert({
          performed_by: s.created_by,
          scope: s.scope,
          subject,
          message,
          recipient_emails: recipients,
          recipient_count: recipients.length,
          attachment_names: [],
          attachment_count: 0,
          total_attachment_bytes: 0,
          report_kind: s.report_kind,
          status: initialStatus,
          source: "scheduled",
          schedule_id: s.id,
          attachment_rule_id: s.attachment_rule_id,
          workflow_state: initialState,
          reviewer_id: s.reviewer_id,
          approver_id: s.approver_id,
        })
        .select("id")
        .single();

      if (dErr) throw dErr;

      // Immutable log entry — performed by schedule creator (proxy for system)
      await supabase.from("interlink_approval_actions").insert({
        dispatch_id: dispatch!.id,
        action: "auto_drafted",
        performed_by: s.created_by,
        performer_role: "system_scheduler",
        from_state: null,
        to_state: initialState,
        comment: `Auto-drafted by schedule "${s.name}" (${s.frequency} @ ${s.run_time}). Recipients: ${recipients.length}.`,
      });

      // Recompute next_run_at
      const { data: nextRun } = await supabase.rpc("compute_interlink_next_run", {
        _frequency: s.frequency,
        _run_time: s.run_time,
        _day_of_week: s.day_of_week,
        _day_of_month: s.day_of_month,
        _from: now,
      });

      await supabase
        .from("interlink_schedules")
        .update({ last_run_at: now, next_run_at: nextRun })
        .eq("id", s.id);

      processed.push({ schedule_id: s.id, dispatch_id: dispatch!.id, recipients: recipients.length });
    } catch (err) {
      processed.push({ schedule_id: s.id, error: (err as Error).message });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed_count: processed.length, processed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
