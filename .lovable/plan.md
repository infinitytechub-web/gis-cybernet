# Substantive Security Findings — Prioritized Fix Plan

All 335 scan items are warnings; 325 are advisory "SECURITY DEFINER callable by anon/authenticated" notes that are intentional (RPC-based RBAC). The 10 below are real, fixable issues.

---

## P0 — Audit forgery (HIGH impact)

### 1. `medical_appointment_audit` INSERT policy is forgeable
**Problem:** Policy `"System inserts appointment audit"` has `WITH CHECK (auth.uid() IS NOT NULL)`, so any signed-in user can fabricate audit rows for appointments they don't own.

**Fix:** Drop the broad INSERT policy and replace with a service-role-only policy. Audit rows should only be inserted by the existing SECURITY DEFINER trigger function (which runs as definer and bypasses RLS).

```sql
DROP POLICY "System inserts appointment audit" ON public.medical_appointment_audit;
CREATE POLICY "Only service role inserts appointment audit"
  ON public.medical_appointment_audit FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'service_role');
```

---

## P1 — Permissive write policy

### 2. `inventory_audit_schedules` UPDATE — `WITH CHECK (true)`
**Problem:** UPDATE policy `audit_sched_update` correctly gates `USING` on command-tier + storekeeper, but `WITH CHECK` is `true`, meaning a row can be mutated to any values (including reassigning ownership).

**Fix:** Mirror the USING expression in WITH CHECK.

```sql
ALTER POLICY audit_sched_update ON public.inventory_audit_schedules
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'oic'::app_role)
    OR has_role(auth.uid(),'2ic'::app_role)
    OR has_role(auth.uid(),'storekeeper'::app_role)
  );
```

---

## P2 — Mutable `search_path` on 8 functions

**Problem:** A SECURITY DEFINER function without a pinned `search_path` can be hijacked via shadowing in a malicious schema. Affected:

1. `block_security_audit_mutation`
2. `block_threshold_audit_mutation`
3. `compute_interlink_next_run`
4. `delete_email`
5. `enqueue_email`
6. `move_to_dlq`
7. `read_email_batch`
8. `set_interlink_schedule_next_run`

**Fix:** Add `SET search_path = public, pg_temp` to each via `ALTER FUNCTION`. No body changes required.

```sql
ALTER FUNCTION public.block_security_audit_mutation()    SET search_path = public, pg_temp;
ALTER FUNCTION public.block_threshold_audit_mutation()   SET search_path = public, pg_temp;
ALTER FUNCTION public.compute_interlink_next_run(...)    SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_email(...)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.enqueue_email(...)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.move_to_dlq(...)                   SET search_path = public, pg_temp;
ALTER FUNCTION public.read_email_batch(...)              SET search_path = public, pg_temp;
ALTER FUNCTION public.set_interlink_schedule_next_run()  SET search_path = public, pg_temp;
```
(Exact argument signatures resolved at migration time via `pg_get_function_identity_arguments`.)

---

## Execution

One migration containing all three sections in P0 → P1 → P2 order. No application code changes; the SECURITY DEFINER triggers that write `medical_appointment_audit` already bypass RLS, so step 1 won't break the medical workflow. Step 2 only tightens UPDATE — current authorized callers already satisfy the same expression. Step 3 is metadata-only.

After applying, re-run the security scan; expected residual = 325 advisory SECURITY DEFINER warnings (intentional RPC pattern).
