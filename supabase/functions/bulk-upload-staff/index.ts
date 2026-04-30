// Bulk Staff List + Night Guard Roster Upload — admin/oic/2ic/chief_staff_officer only.
// Modes:
//   - Staff rows: upserts profiles by staff_id, optionally deactivates staff missing from file.
//   - Roster rows: replaces Night Guard shift_assignments for the dates covered by the upload.
//   - Optional snapshot of profiles + night_guard assignments before commit (for rollback).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InputRow = Record<string, string | number | null | undefined>;

interface RowOutcome {
  rowIndex: number;
  staffId: string | null;
  status: "create" | "update" | "skip" | "error" | "deactivate";
  message?: string;
  changedFields?: string[];
}

interface RosterRow {
  staff_id?: string;
  staffId?: string;
  date?: string;
  Date?: string;
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

function normaliseDate(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Auth: must be admin / oic / 2ic / chief_staff_officer ────────
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
    if (!(roleSet.has("admin") || roleSet.has("oic") || roleSet.has("2ic") || roleSet.has("chief_staff_officer"))) {
      return new Response(JSON.stringify({ error: "Forbidden — command tier only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Body ──────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const rows = (body.rows ?? []) as InputRow[];
    const rosterRows = (body.rosterRows ?? []) as RosterRow[];
    const fileName = (body.fileName ?? null) as string | null;
    const rosterFileName = (body.rosterFileName ?? null) as string | null;
    const dryRun = !!body.dryRun;
    const deactivateMissing = !!body.deactivateMissing;
    const takeSnapshot = !!body.snapshot;

    if ((!Array.isArray(rows) || rows.length === 0) && (!Array.isArray(rosterRows) || rosterRows.length === 0)) {
      return new Response(JSON.stringify({ error: "Provide at least one of: staff rows or roster rows" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rows.length > 5000) {
      return new Response(JSON.stringify({ error: "Limit is 5,000 staff rows per upload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rosterRows.length > 10000) {
      return new Response(JSON.stringify({ error: "Limit is 10,000 roster rows per upload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Reference data ────────────────────────────────────────────────
    const [{ data: deps }, { data: rks }, { data: existing }, { data: shiftsList }] = await Promise.all([
      admin.from("departments").select("id, name"),
      admin.from("ranks").select("id, name, abbreviation"),
      admin.from("profiles").select("id, staff_id, first_name, last_name, rank_id, department_id, phone, gender, status, unit, shift_group, ghana_card_number, email, blood_group, intake, training_designation, staff_category, office, weapon_trained, weapon_training_date"),
      admin.from("shifts").select("id, name"),
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

    const nightGuardShift = (shiftsList ?? []).find((s: any) => (s.name ?? "").toLowerCase().includes("night guard"));

    // ── Process staff rows ────────────────────────────────────────────
    const outcomes: RowOutcome[] = [];
    const toCreate: any[] = [];
    const toUpdate: { id: string; patch: any; changedFields: string[]; staffId: string }[] = [];
    const seenStaffIds = new Set<string>();

    rows.forEach((row, idx) => {
      try {
        const staffId = pickKey(row, "staff_id", "staffid", "id");
        const firstName = pickKey(row, "first_name", "firstname");
        const lastName = pickKey(row, "last_name", "lastname", "surname");
        if (!staffId) { outcomes.push({ rowIndex: idx, staffId: null, status: "error", message: "Missing staff_id" }); return; }
        if (!firstName || !lastName) { outcomes.push({ rowIndex: idx, staffId, status: "error", message: "Missing first_name / last_name" }); return; }
        seenStaffIds.add(staffId.toLowerCase());

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
            const diff: Record<string, { from: any; to: any }> = {};
            for (const k of changed) diff[k] = { from: (existingRow as any)[k] ?? null, to: (patch as any)[k] ?? null };
            outcomes.push({ rowIndex: idx, staffId, status: "update", changedFields: changed, diff } as any);
            toUpdate.push({ id: existingRow.id, patch, changedFields: changed, staffId });
          }
        } else {
          const diff: Record<string, { from: any; to: any }> = {};
          for (const [k, v] of Object.entries(patch)) diff[k] = { from: null, to: v };
          outcomes.push({ rowIndex: idx, staffId, status: "create", diff } as any);
          toCreate.push({ staff_id: staffId, ...patch });
        }
      } catch (e) {
        outcomes.push({ rowIndex: idx, staffId: null, status: "error", message: (e as Error).message });
      }
    });

    // ── Deactivate-missing planning ───────────────────────────────────
    const deptNameById = new Map<string, string>();
    for (const d of (deps ?? [])) deptNameById.set(d.id, d.name);
    const rankNameById = new Map<string, string>();
    for (const r of (rks ?? [])) rankNameById.set(r.id, r.abbreviation || r.name);
    const toDeactivate: { id: string; staffId: string; from: string; fullName: string; department: string; rank: string; designation: string; office: string }[] = [];
    if (deactivateMissing && rows.length > 0) {
      for (const p of (existing ?? [])) {
        if (p.status === "inactive") continue;
        if (!seenStaffIds.has(p.staff_id.toLowerCase())) {
          const deptName = p.department_id ? (deptNameById.get(p.department_id) ?? "—") : "—";
          const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
          const rankName = p.rank_id ? (rankNameById.get(p.rank_id) ?? "—") : "—";
          const designation = (p as any).training_designation || "—";
          const office = (p as any).office || "—";
          toDeactivate.push({ id: p.id, staffId: p.staff_id, from: p.status, fullName, department: deptName, rank: rankName, designation, office });
          outcomes.push({
            rowIndex: -1,
            staffId: p.staff_id,
            status: "deactivate",
            message: `Will be set to inactive (not in upload)`,
            fullName,
            department: deptName,
            rank: rankName,
            designation,
            office,
          } as any);
        }
      }
    }

    // ── Roster planning ───────────────────────────────────────────────
    const rosterPlan: { profile_id: string; shift_id: string; start_date: string; end_date: string }[] = [];
    const rosterErrors: { rowIndex: number; message: string; staffId: string | null }[] = [];
    const rosterDates = new Set<string>();
    let rosterUnchanged = 0;
    if (rosterRows.length > 0) {
      if (!nightGuardShift) {
        rosterErrors.push({ rowIndex: -1, message: "No 'Night Guard' shift defined in shifts table", staffId: null });
      } else {
        // Build profile lookup
        const profileByStaff = new Map<string, string>();
        for (const p of (existing ?? [])) profileByStaff.set(p.staff_id.toLowerCase(), p.id);
        // Also include freshly created staff (we'll resolve their IDs after insert)
        const pendingByStaffId = new Map<string, true>();
        for (const c of toCreate) pendingByStaffId.set(c.staff_id.toLowerCase(), true);

        rosterRows.forEach((r, idx) => {
          const sid = (r.staff_id ?? r.staffId ?? (r as any)["Staff ID"] ?? "")?.toString().trim();
          const dateRaw = r.date ?? r.Date ?? (r as any)["date"] ?? (r as any)["Date"];
          const date = normaliseDate(dateRaw);
          if (!sid) { rosterErrors.push({ rowIndex: idx, message: "Missing Staff ID", staffId: null }); return; }
          if (!date) { rosterErrors.push({ rowIndex: idx, message: "Missing/invalid Date", staffId: sid }); return; }
          const pid = profileByStaff.get(sid.toLowerCase());
          if (!pid && !pendingByStaffId.has(sid.toLowerCase())) {
            rosterErrors.push({ rowIndex: idx, message: "Staff not found (and not in staff upload)", staffId: sid });
            return;
          }
          if (pid) {
            rosterPlan.push({ profile_id: pid, shift_id: nightGuardShift.id, start_date: date, end_date: date });
            rosterDates.add(date);
          } else {
            // mark for post-create resolution
            rosterPlan.push({ profile_id: `__pending__:${sid.toLowerCase()}`, shift_id: nightGuardShift.id, start_date: date, end_date: date });
            rosterDates.add(date);
          }
        });
      }
    }

    const createdCount = outcomes.filter((o) => o.status === "create").length;
    const updatedCount = outcomes.filter((o) => o.status === "update").length;
    const skippedCount = outcomes.filter((o) => o.status === "skip").length;
    const errorCount = outcomes.filter((o) => o.status === "error").length;
    const deactivateCount = toDeactivate.length;

    // ── Snapshot + Commit ─────────────────────────────────────────────
    const commitErrors: { staffId: string; error: string }[] = [];
    let snapshotId: string | null = null;

    if (!dryRun) {
      // 1. Snapshot first (immutable rollback point)
      if (takeSnapshot) {
        const ngShiftIds = (shiftsList ?? []).filter((s: any) => (s.name ?? "").toLowerCase().includes("night guard")).map((s: any) => s.id);
        const { data: ngAssignments } = ngShiftIds.length
          ? await admin.from("shift_assignments").select("id, profile_id, shift_id, start_date, end_date, created_at").in("shift_id", ngShiftIds)
          : { data: [] };
        const { data: uploaderProfile } = await admin
          .from("profiles").select("first_name, last_name")
          .eq("user_id", user.id).maybeSingle();
        const uploaderName = uploaderProfile
          ? `${uploaderProfile.first_name ?? ""} ${uploaderProfile.last_name ?? ""}`.trim() || null
          : null;

        const { data: snap, error: snapErr } = await admin.from("staff_bulk_upload_snapshots").insert({
          taken_by: user.id,
          taken_by_name: uploaderName,
          file_name: fileName,
          note: `Pre-upload snapshot (${rows.length} staff rows, ${rosterRows.length} roster rows${deactivateMissing ? ", deactivate-missing" : ""})`,
          profiles_data: existing ?? [],
          night_guard_data: ngAssignments ?? [],
          profiles_count: (existing ?? []).length,
          night_guard_count: (ngAssignments ?? []).length,
        }).select("id").single();
        if (snapErr) {
          return new Response(JSON.stringify({ error: `Snapshot failed: ${snapErr.message}` }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        snapshotId = snap.id;
      }

      // 2. Inserts in batches of 200
      for (let i = 0; i < toCreate.length; i += 200) {
        const batch = toCreate.slice(i, i + 200);
        const { error } = await admin.from("profiles").insert(batch);
        if (error) {
          for (const r of batch) commitErrors.push({ staffId: r.staff_id, error: error.message });
        }
      }

      // 3. Updates via caller's JWT (so restrict_profile_updates trigger sees correct role)
      for (const u of toUpdate) {
        const { error } = await userClient.from("profiles").update(u.patch).eq("id", u.id);
        if (error) commitErrors.push({ staffId: u.staffId, error: error.message });
      }

      // 4. Deactivate missing
      for (const d of toDeactivate) {
        const { error } = await userClient.from("profiles").update({ status: "inactive" }).eq("id", d.id);
        if (error) commitErrors.push({ staffId: d.staffId, error: `deactivate: ${error.message}` });
      }

      // 5. Roster replace
      if (rosterPlan.length > 0 && nightGuardShift && rosterDates.size > 0) {
        const dates = Array.from(rosterDates).sort();
        // Wipe night-guard assignments for the dates covered
        const { error: delErr } = await admin
          .from("shift_assignments")
          .delete()
          .eq("shift_id", nightGuardShift.id)
          .in("start_date", dates);
        if (delErr) {
          commitErrors.push({ staffId: "(roster)", error: `wipe: ${delErr.message}` });
        }

        // Resolve any __pending__ profile_ids by re-querying newly created profiles
        let resolvedPlan = rosterPlan;
        const pendingIds = rosterPlan.filter((r) => r.profile_id.startsWith("__pending__:"));
        if (pendingIds.length > 0) {
          const sids = Array.from(new Set(pendingIds.map((r) => r.profile_id.split(":")[1])));
          const { data: justCreated } = await admin
            .from("profiles").select("id, staff_id").in("staff_id", sids);
          const byStaff = new Map<string, string>();
          for (const p of (justCreated ?? [])) byStaff.set(p.staff_id.toLowerCase(), p.id);
          resolvedPlan = rosterPlan.map((r) => {
            if (!r.profile_id.startsWith("__pending__:")) return r;
            const sid = r.profile_id.split(":")[1];
            const pid = byStaff.get(sid);
            return pid ? { ...r, profile_id: pid } : r;
          }).filter((r) => !r.profile_id.startsWith("__pending__:"));
        }

        // Dedup (same profile + date)
        const seen = new Set<string>();
        const finalRows = resolvedPlan.filter((r) => {
          const k = `${r.profile_id}|${r.start_date}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        for (let i = 0; i < finalRows.length; i += 500) {
          const batch = finalRows.slice(i, i + 500);
          const { error } = await admin.from("shift_assignments").insert(batch);
          if (error) commitErrors.push({ staffId: "(roster)", error: `insert: ${error.message}` });
        }
      }
    }

    // 6. Auto-rollback: if commit failed AND we have a snapshot, restore it
    const autoRollback: { attempted: boolean; succeeded: boolean; message?: string; profilesRestored?: number; nightGuardRestored?: number } = { attempted: false, succeeded: false };
    if (!dryRun && commitErrors.length > 0 && snapshotId) {
      autoRollback.attempted = true;
      try {
        const { data: rb, error: rbErr } = await admin.rpc("restore_staff_bulk_snapshot", { p_snapshot_id: snapshotId });
        if (rbErr) {
          autoRollback.message = rbErr.message;
        } else {
          autoRollback.succeeded = true;
          autoRollback.profilesRestored = (rb as any)?.profiles_restored ?? 0;
          autoRollback.nightGuardRestored = (rb as any)?.night_guard_restored ?? 0;
        }
      } catch (e) {
        autoRollback.message = (e as Error).message;
      }
    }
    }

    // Resolve uploader name (for audit row)
    const { data: uploaderProfile } = await admin
      .from("profiles").select("first_name, last_name")
      .eq("user_id", user.id).maybeSingle();
    const uploaderName = uploaderProfile
      ? `${uploaderProfile.first_name ?? ""} ${uploaderProfile.last_name ?? ""}`.trim() || null
      : null;

    await admin.from("staff_bulk_upload_audit").insert({
      uploaded_by: user.id,
      uploaded_by_name: uploaderName,
      file_name: fileName,
      total_rows: rows.length + rosterRows.length,
      created_count: createdCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      error_count: errorCount + commitErrors.length + rosterErrors.length,
      dry_run: dryRun,
      errors: [
        ...outcomes.filter((o) => o.status === "error").map((o) => ({ rowIndex: o.rowIndex, staffId: o.staffId, message: o.message })),
        ...commitErrors,
        ...rosterErrors.map((e) => ({ rowIndex: e.rowIndex, staffId: e.staffId, message: `roster: ${e.message}` })),
      ],
      summary: {
        fileName, rosterFileName, dryRun,
        deactivateMissing, snapshot: takeSnapshot, snapshotId,
        totals: { create: createdCount, update: updatedCount, skip: skippedCount, error: errorCount, deactivate: deactivateCount, rosterRows: rosterPlan.length, rosterDates: rosterDates.size },
      },
    });

    return new Response(JSON.stringify({
      dryRun, totalRows: rows.length + rosterRows.length,
      createdCount, updatedCount, skippedCount, errorCount,
      deactivateCount,
      rosterPlanned: rosterPlan.length,
      rosterDates: Array.from(rosterDates).sort(),
      rosterErrors,
      snapshotId,
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
