// Bulk Staff List Upload — admin/oic/2ic only.
// Accepts a JSON array of staff rows, resolves rank/department by name (case-insensitive),
// and upserts profiles by staff_id. Supports dry-run preview before commit.
// Writes a row to staff_bulk_upload_audit summarising the operation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InputRow = Record<string, string | number | null | undefined>;

interface RowOutcome {
  rowIndex: number;
  staffId: string | null;
  status: "create" | "update" | "skip" | "error";
  message?: string;
  changedFields?: string[];
}

const ALLOWED_GENDERS = new Set(["male", "female", "m", "f"]);
const ALLOWED_STATUS = new Set(["active", "inactive", "study_leave", "retired", "suspended"]);
const ALLOWED_BLOOD = new Set(["A+","A-","B+","B-","AB+","AB-","O+","O-"]);

function pickKey(row: InputRow, ...keys: string[]): string | null {
  for (const k of keys) {
    for (const actual of Object.keys(row)) {
      if (actual.trim().toLowerCase().replace(/[\s_-]+/g, "") === k.toLowerCase().replace(/[\s_-]+/g, "")) {
        const v = row[actual];
        if (v === null || v === undefined) continue;
        const s = String(v).trim();
        if (s.length === 0) continue;
        return s;
      }
    }
  }
  return null;
}

function normaliseGender(v: string | null): string | null {
  if (!v) return null;
  const x = v.toLowerCase();
  if (x === "m" || x === "male") return "male";
  if (x === "f" || x === "female") return "female";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Auth: must be admin / oic / 2ic ────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!(roleSet.has("admin") || roleSet.has("oic") || roleSet.has("2ic"))) {
      return new Response(JSON.stringify({ error: "Forbidden — command tier only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Body ──────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const rows = (body.rows ?? []) as InputRow[];
    const fileName = (body.fileName ?? null) as string | null;
    const dryRun = !!body.dryRun;
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "rows[] is required and cannot be empty" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rows.length > 5000) {
      return new Response(JSON.stringify({ error: "Limit is 5,000 rows per upload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Reference data ────────────────────────────────────────────────
    const [{ data: deps }, { data: rks }, { data: existing }] = await Promise.all([
      admin.from("departments").select("id, name"),
      admin.from("ranks").select("id, name, abbreviation"),
      admin.from("profiles").select("id, staff_id, first_name, last_name, rank_id, department_id, phone, gender, status, unit, shift_group, ghana_card_number, email, blood_group, intake, training_designation, staff_category, office, weapon_trained, weapon_training_date"),
    ]);
    const deptByName = new Map<string, string>();
    for (const d of (deps ?? [])) deptByName.set(d.name.toLowerCase(), d.id);
    const rankByName = new Map<string, string>();
    for (const r of (rks ?? [])) {
      rankByName.set(r.name.toLowerCase(), r.id);
      if (r.abbreviation) rankByName.set(r.abbreviation.toLowerCase(), r.id);
    }
    const existingByStaffId = new Map<string, any>();
    for (const p of (existing ?? [])) existingByStaffId.set(p.staff_id.toLowerCase(), p);

    // ── Process rows ──────────────────────────────────────────────────
    const outcomes: RowOutcome[] = [];
    const toCreate: any[] = [];
    const toUpdate: { id: string; patch: any; changedFields: string[]; staffId: string }[] = [];

    rows.forEach((row, idx) => {
      try {
        const staffId = pickKey(row, "staff_id", "staffid", "id");
        const firstName = pickKey(row, "first_name", "firstname");
        const lastName = pickKey(row, "last_name", "lastname", "surname");
        if (!staffId) { outcomes.push({ rowIndex: idx, staffId: null, status: "error", message: "Missing staff_id" }); return; }
        if (!firstName || !lastName) { outcomes.push({ rowIndex: idx, staffId, status: "error", message: "Missing first_name / last_name" }); return; }

        const rankRaw = pickKey(row, "rank", "rank_name", "rank_abbrev", "rank_abbreviation");
        const deptRaw = pickKey(row, "department", "department_name", "dept");
        const phone = pickKey(row, "phone", "phone_number", "mobile");
        const genderRaw = pickKey(row, "gender", "sex");
        const statusRaw = pickKey(row, "status");
        const unit = pickKey(row, "unit");
        const shiftGroup = pickKey(row, "shift_group", "shift", "group");
        const ghanaCard = pickKey(row, "ghana_card_number", "ghana_card", "ghanacard");
        const email = pickKey(row, "email");
        const blood = pickKey(row, "blood_group", "blood");
        const intakeRaw = pickKey(row, "intake");
        const trainingDes = pickKey(row, "training_designation");
        const staffCat = pickKey(row, "staff_category");
        const office = pickKey(row, "office");

        const rankId = rankRaw ? rankByName.get(rankRaw.toLowerCase()) : null;
        if (rankRaw && !rankId) { outcomes.push({ rowIndex: idx, staffId, status: "error", message: `Unknown rank "${rankRaw}"` }); return; }
        const deptId = deptRaw ? deptByName.get(deptRaw.toLowerCase()) : null;
        if (deptRaw && !deptId) { outcomes.push({ rowIndex: idx, staffId, status: "error", message: `Unknown department "${deptRaw}"` }); return; }
        const gender = normaliseGender(genderRaw);
        if (genderRaw && !gender) { outcomes.push({ rowIndex: idx, staffId, status: "error", message: `Invalid gender "${genderRaw}"` }); return; }
        const status = statusRaw ? statusRaw.toLowerCase().replace(/\s+/g, "_") : null;
        if (status && !ALLOWED_STATUS.has(status)) { outcomes.push({ rowIndex: idx, staffId, status: "error", message: `Invalid status "${statusRaw}"` }); return; }
        if (blood && !ALLOWED_BLOOD.has(blood.toUpperCase())) { outcomes.push({ rowIndex: idx, staffId, status: "error", message: `Invalid blood group "${blood}"` }); return; }
        let intake: number | null = null;
        if (intakeRaw) {
          const n = parseInt(intakeRaw, 10);
          if (Number.isNaN(n) || n < 1 || n > 100) { outcomes.push({ rowIndex: idx, staffId, status: "error", message: `Invalid intake "${intakeRaw}" (1–100)` }); return; }
          intake = n;
        }

        const patch: Record<string, any> = {
          first_name: firstName, last_name: lastName,
          ...(rankId !== null ? { rank_id: rankId } : {}),
          ...(deptId !== null ? { department_id: deptId } : {}),
          ...(phone !== null ? { phone } : {}),
          ...(gender !== null ? { gender } : {}),
          ...(status !== null ? { status } : {}),
          ...(unit !== null ? { unit } : {}),
          ...(shiftGroup !== null ? { shift_group: shiftGroup.toUpperCase() } : {}),
          ...(ghanaCard !== null ? { ghana_card_number: ghanaCard } : {}),
          ...(email !== null ? { email } : {}),
          ...(blood !== null ? { blood_group: blood.toUpperCase() } : {}),
          ...(intake !== null ? { intake } : {}),
          ...(trainingDes !== null ? { training_designation: trainingDes } : {}),
          ...(staffCat !== null ? { staff_category: staffCat } : {}),
          ...(office !== null ? { office } : {}),
        };

        const existingRow = existingByStaffId.get(staffId.toLowerCase());
        if (existingRow) {
          const changed: string[] = [];
          for (const [k, v] of Object.entries(patch)) {
            const prev = (existingRow as any)[k];
            if ((prev ?? null) !== (v ?? null)) changed.push(k);
          }
          if (changed.length === 0) {
            outcomes.push({ rowIndex: idx, staffId, status: "skip", message: "No changes" });
          } else {
            outcomes.push({ rowIndex: idx, staffId, status: "update", changedFields: changed });
            toUpdate.push({ id: existingRow.id, patch, changedFields: changed, staffId });
          }
        } else {
          outcomes.push({ rowIndex: idx, staffId, status: "create" });
          toCreate.push({ staff_id: staffId, ...patch });
        }
      } catch (e) {
        outcomes.push({ rowIndex: idx, staffId: null, status: "error", message: (e as Error).message });
      }
    });

    const createdCount = outcomes.filter((o) => o.status === "create").length;
    const updatedCount = outcomes.filter((o) => o.status === "update").length;
    const skippedCount = outcomes.filter((o) => o.status === "skip").length;
    const errorCount = outcomes.filter((o) => o.status === "error").length;

    // ── Commit (unless dry-run) ────────────────────────────────────────
    const commitErrors: { staffId: string; error: string }[] = [];
    if (!dryRun) {
      // Inserts in batches of 200
      for (let i = 0; i < toCreate.length; i += 200) {
        const batch = toCreate.slice(i, i + 200);
        const { error } = await admin.from("profiles").insert(batch);
        if (error) {
          for (const r of batch) commitErrors.push({ staffId: r.staff_id, error: error.message });
        }
      }
      // Updates one at a time (different patches). Service role bypasses RLS triggers? No — triggers still run.
      // restrict_profile_updates trigger checks auth.uid() role; service role calls run as no-auth so has_role(NULL) is false.
      // We therefore use SQL via rpc not available — workaround: temporarily SET LOCAL role admin? Cannot. Instead, the
      // restrict_profile_updates trigger will block department/rank/status changes done by service role with no auth.uid().
      // We mitigate by performing updates with the caller's JWT-scoped client so trigger sees has_role(caller, 'admin') etc.
      // (Allowed for admin/oic/2ic for department; rank/status admin-only — caller already validated above.)
      for (const u of toUpdate) {
        const { error } = await userClient.from("profiles").update(u.patch).eq("id", u.id);
        if (error) commitErrors.push({ staffId: u.staffId, error: error.message });
      }
    }

    // Resolve uploader name
    const { data: uploaderProfile } = await admin
      .from("profiles").select("first_name, last_name")
      .eq("user_id", user.id).maybeSingle();
    const uploaderName = uploaderProfile
      ? `${uploaderProfile.first_name ?? ""} ${uploaderProfile.last_name ?? ""}`.trim() || null
      : null;

    // Audit row (always written, including dry-run for visibility)
    await admin.from("staff_bulk_upload_audit").insert({
      uploaded_by: user.id,
      uploaded_by_name: uploaderName,
      file_name: fileName,
      total_rows: rows.length,
      created_count: dryRun ? createdCount : createdCount - commitErrors.filter((e) => toCreate.find((c) => c.staff_id === e.staffId)).length,
      updated_count: dryRun ? updatedCount : updatedCount - commitErrors.filter((e) => toUpdate.find((u) => u.staffId === e.staffId)).length,
      skipped_count: skippedCount,
      error_count: errorCount + commitErrors.length,
      dry_run: dryRun,
      errors: [
        ...outcomes.filter((o) => o.status === "error").map((o) => ({ rowIndex: o.rowIndex, staffId: o.staffId, message: o.message })),
        ...commitErrors,
      ],
      summary: { fileName, dryRun, totals: { create: createdCount, update: updatedCount, skip: skippedCount, error: errorCount } },
    });

    return new Response(JSON.stringify({
      dryRun, totalRows: rows.length,
      createdCount, updatedCount, skippedCount, errorCount,
      commitErrors,
      outcomes,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("bulk-upload-staff fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
