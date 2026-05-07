/**
 * Pure helpers around the appraisal create flow so we can unit/integration
 * test the bulk loop and the pre-submit duplicate check without spinning up
 * the React tree.
 *
 * The functions accept a Supabase-like client so tests can pass in a mock.
 */

export type AppraisalCriterion = { key: string };

export type AppraisalPayloadBase = {
  appraised_by: string;
  period_year: number;
  period_month: number | null;
  status: "draft" | "submitted";
  comments: string | null;
  submitted_at: string | null;
};

export type BulkResult = {
  created: string[];
  duplicates: string[];
  failures: string[];
};

type SupabaseLike = {
  from: (table: string) => any;
};

const isUniqueViolation = (err: any) =>
  err?.code === "23505" || /already exists/i.test(err?.message ?? "");

/**
 * Returns the subset of `targetIds` that already have an appraisal for the
 * given period. Uses COALESCE-equivalent logic by sending `period_month`
 * as either an integer or `is null` based on the value.
 */
export async function checkExistingAppraisals(
  client: SupabaseLike,
  args: {
    targetIds: string[];
    periodYear: number;
    periodMonth: number | null;
  },
): Promise<string[]> {
  const { targetIds, periodYear, periodMonth } = args;
  if (targetIds.length === 0) return [];
  let q = client
    .from("staff_appraisals")
    .select("staff_profile_id")
    .in("staff_profile_id", targetIds)
    .eq("period_year", periodYear);
  q = periodMonth == null ? q.is("period_month", null) : q.eq("period_month", periodMonth);
  const { data, error } = await q;
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r: any) => r.staff_profile_id as string)));
}

/**
 * Inserts one appraisal + its score rows per target id. Reports per-officer
 * outcome instead of failing the whole batch on first error.
 */
export async function submitBulkAppraisals(
  client: SupabaseLike,
  args: {
    targetIds: string[];
    payloadBase: AppraisalPayloadBase;
    scores: Record<string, number>;
    criteria: AppraisalCriterion[];
  },
): Promise<BulkResult> {
  const { targetIds, payloadBase, scores, criteria } = args;
  const created: string[] = [];
  const duplicates: string[] = [];
  const failures: string[] = [];

  for (const id of targetIds) {
    const { data: ap, error: ae } = await client
      .from("staff_appraisals")
      .insert({ ...payloadBase, staff_profile_id: id })
      .select("id")
      .single();
    if (ae) {
      if (isUniqueViolation(ae)) duplicates.push(id);
      else failures.push(`${id}: ${ae.message}`);
      continue;
    }
    const rows = criteria.map((c) => ({
      appraisal_id: (ap as any).id,
      criterion: c.key,
      score: scores[c.key],
    }));
    const { error: se } = await client.from("staff_appraisal_scores").insert(rows);
    if (se) {
      failures.push(`${id}: ${se.message}`);
      continue;
    }
    created.push(id);
  }
  return { created, duplicates, failures };
}
