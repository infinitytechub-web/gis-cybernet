/**
 * Shared password-policy evaluation.
 *
 * The authoritative rules live on the `app_settings` row and are enforced
 * server-side by `public.validate_password_policy()`. This module mirrors the
 * same logic on the client so forms can show the requirements live, and
 * exposes a hook that reads the policy through `get_password_policy()`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStrength } from "@/components/ui/password-strength";

export interface PasswordPolicy {
  min_length: number;
  require_upper: boolean;
  require_lower: boolean;
  require_number: boolean;
  require_symbol: boolean;
  min_strength: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  min_length: 8,
  require_upper: false,
  require_lower: false,
  require_number: false,
  require_symbol: false,
  min_strength: 4,
};

const STRENGTH_LABELS = ["", "Very Weak", "Weak", "Fair", "Strong", "Very Strong"];

/** Human-readable list of the rules currently in force. */
export function describePolicy(policy: PasswordPolicy): string[] {
  const rules = [`At least ${policy.min_length} characters`];
  if (policy.require_upper) rules.push("An uppercase letter (A-Z)");
  if (policy.require_lower) rules.push("A lowercase letter (a-z)");
  if (policy.require_number) rules.push("A number (0-9)");
  if (policy.require_symbol) rules.push("A symbol (e.g. ! ? # @)");
  rules.push(`Strength of at least "${STRENGTH_LABELS[policy.min_strength] || policy.min_strength}"`);
  return rules;
}

export interface PolicyCheck {
  ok: boolean;
  score: number;
  errors: string[];
}

/** Mirrors `public.validate_password_policy()`. */
export function checkPassword(password: string, policy: PasswordPolicy): PolicyCheck {
  const pw = password ?? "";
  const errors: string[] = [];

  if (pw.length < policy.min_length) {
    errors.push(`Must be at least ${policy.min_length} characters long`);
  }
  if (policy.require_upper && !/[A-Z]/.test(pw)) errors.push("Must include an uppercase letter");
  if (policy.require_lower && !/[a-z]/.test(pw)) errors.push("Must include a lowercase letter");
  if (policy.require_number && !/[0-9]/.test(pw)) errors.push("Must include a number");
  if (policy.require_symbol && !/[^A-Za-z0-9]/.test(pw)) errors.push("Must include a symbol");

  const score = getStrength(pw);
  if (score < policy.min_strength) {
    errors.push(`Password strength is too low (needs ${policy.min_strength} of 5)`);
  }

  return { ok: errors.length === 0, score, errors };
}

/** Reads the live password policy; falls back to the shipped defaults. */
export function usePasswordPolicy(): PasswordPolicy {
  const { data } = useQuery({
    queryKey: ["password-policy"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_password_policy");
      if (error || !data) return DEFAULT_PASSWORD_POLICY;
      return { ...DEFAULT_PASSWORD_POLICY, ...(data as PasswordPolicy) };
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data ?? DEFAULT_PASSWORD_POLICY;
}

/**
 * Server-side confirmation. Returns the unmet rules, or an empty list when the
 * password is acceptable. Falls back to the client evaluation when the RPC is
 * unavailable so password changes never hard-fail on a transport error.
 */
export async function validatePasswordServerSide(
  password: string,
  fallbackPolicy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): Promise<string[]> {
  const { data, error } = await (supabase as any).rpc("validate_password_policy", {
    _password: password,
  });
  if (error || !data) return checkPassword(password, fallbackPolicy).errors;
  const row = data as { ok?: boolean; errors?: string[] };
  return row.ok ? [] : (row.errors ?? ["Password does not meet the required policy"]);
}
