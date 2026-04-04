

## Fix: Profile UPDATE Policy Missing WITH CHECK Constraint

### Problem
The current `Users can update own profile` RLS policy on the `profiles` table has:
- **USING**: `user_id = auth.uid()` (correct — only lets users update their own row)
- **WITH CHECK**: `user_id = auth.uid()` (exists but doesn't prevent changing `user_id` to another value mid-update)

Actually, the current WITH CHECK `(user_id = auth.uid())` already ensures the **resulting** row must have `user_id = auth.uid()`. However, the scanner flags this because a user could theoretically set `user_id` to their own ID on a different profile row — but the USING clause prevents that.

The real risk is more subtle: a user could set `user_id = NULL`, which would pass neither check. But to be thorough and satisfy the scanner, we should tighten the policy to explicitly prevent `user_id` modification.

### Solution
Drop and recreate the UPDATE policy with a WITH CHECK that explicitly ensures `user_id` cannot be changed:

```sql
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

This is actually what's already there. The better fix is to add a database trigger that prevents `user_id` from being modified on UPDATE:

```sql
CREATE OR REPLACE FUNCTION public.prevent_user_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Changing user_id on profiles is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_profile_user_id_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_id_change();
```

### Steps
1. **Create migration** — Add the `prevent_user_id_change()` trigger function and attach it to the `profiles` table
2. **Mark finding resolved** — Dismiss the security scanner finding

### Technical Details
- The trigger runs BEFORE UPDATE, blocking any attempt to change `user_id` regardless of who makes the request (even admins via service role would be blocked from accidental changes)
- Combined with the existing RLS WITH CHECK, this provides defense-in-depth against profile hijacking

