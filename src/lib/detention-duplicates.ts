import { supabase } from "@/integrations/supabase/client";

/** A possible duplicate returned by the detention_find_duplicates lookup. */
export interface DuplicateMatch {
  id: string;
  first_name: string | null;
  last_name: string | null;
  alias: string | null;
  date_of_birth: string | null;
  id_type: string | null;
  id_number: string | null;
  status: string | null;
  intake_at: string | null;
  cell_number: string | null;
  /** 'block' = same ID/passport already in custody; 'warn' = likely repeat detainee. */
  severity: "block" | "warn";
  match_reason: string;
}

export interface DuplicateCheckInput {
  first_name?: string | null;
  last_name?: string | null;
  alias?: string | null;
  date_of_birth?: string | null;
  id_type?: string | null;
  id_number?: string | null;
}

export interface DuplicateCheckResult {
  matches: DuplicateMatch[];
  /** True when at least one match must block the intake outright. */
  blocked: boolean;
}

/**
 * Look for existing detainee records that match the intake on key identifiers
 * (ID/passport number, full name + date of birth, or alias). The matching runs
 * server-side so it also sees records the current officer cannot list, and the
 * same rule is enforced again by a database trigger on insert.
 */
export async function checkDetaineeDuplicates(
  input: DuplicateCheckInput,
  excludeId?: string | null,
): Promise<DuplicateCheckResult> {
  const { data, error } = await supabase.rpc("detention_find_duplicates", {
    _first_name: input.first_name?.trim() || null,
    _last_name: input.last_name?.trim() || null,
    _date_of_birth: input.date_of_birth?.trim() || null,
    _id_type: input.id_type?.trim() || null,
    _id_number: input.id_number?.trim() || null,
    _alias: input.alias?.trim() || null,
    _exclude_id: excludeId ?? null,
  });
  if (error) throw error;
  const matches = (data ?? []) as DuplicateMatch[];
  return { matches, blocked: matches.some((m) => m.severity === "block") };
}

/** Short one-line summary of a match, used in toasts and printed notes. */
export function describeMatch(m: DuplicateMatch): string {
  const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unnamed record";
  return `${name} — ${m.match_reason}`;
}
