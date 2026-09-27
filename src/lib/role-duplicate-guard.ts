import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export class DuplicateRoleError extends Error {
  constructor(public duplicates: { user_id: string; role: string }[]) {
    super(
      duplicates.length === 1
        ? `This staff member already holds the "${duplicates[0].role}" role. Duplicate assignment was not saved.`
        : `${duplicates.length} assignments were duplicates of roles staff already hold. Nothing was saved.`,
    );
    this.name = "DuplicateRoleError";
  }
}

/** Throws DuplicateRoleError (and alerts the admin) if any user already holds the role, or the list repeats itself. */
export async function assertNoDuplicateRoles(rows: { user_id: string; role: string }[]) {
  const seen = new Set<string>();
  const dupes: { user_id: string; role: string }[] = [];
  for (const r of rows) {
    const k = `${r.user_id}|${r.role}`;
    if (seen.has(k)) dupes.push(r);
    seen.add(k);
  }
  const ids = [...new Set(rows.map((r) => r.user_id))];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids.slice(i, i + 100));
    if (error) throw new Error("Could not verify existing roles; nothing was saved.");
    const existing = new Set((data ?? []).map((d) => `${d.user_id}|${d.role}`));
    for (const r of rows) if (existing.has(`${r.user_id}|${r.role}`)) dupes.push(r);
  }
  if (dupes.length) {
    const err = new DuplicateRoleError(dupes);
    toast.warning("Duplicate role assignment blocked", { description: err.message });
    throw err;
  }
}

/** Maps a database unique-violation to a friendly duplicate-role message. */
export function friendlyRoleError(e: any): string {
  if (e?.code === "23505" || /duplicate key/i.test(e?.message ?? "")) {
    return "This staff member already holds that role. Duplicate assignment was not saved.";
  }
  return e?.message ?? "Failed to save role";
}
