import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkPassword, describePolicy, type PasswordPolicy } from "@/lib/password-policy";

/**
 * Live checklist of the configured password rules. Mirrors the server-side
 * `validate_password_policy()` check so users see exactly what is missing.
 */
export function PasswordRules({
  password,
  policy,
  className,
}: {
  password: string;
  policy: PasswordPolicy;
  className?: string;
}) {
  const { errors } = checkPassword(password, policy);
  const rules = describePolicy(policy);
  // describePolicy and checkPassword emit rules in the same order.
  const unmet = new Set<number>();
  const order: ((pw: string) => boolean)[] = [
    (pw) => pw.length >= policy.min_length,
    ...(policy.require_upper ? [(pw: string) => /[A-Z]/.test(pw)] : []),
    ...(policy.require_lower ? [(pw: string) => /[a-z]/.test(pw)] : []),
    ...(policy.require_number ? [(pw: string) => /[0-9]/.test(pw)] : []),
    ...(policy.require_symbol ? [(pw: string) => /[^A-Za-z0-9]/.test(pw)] : []),
    () => errors.every((e) => !e.startsWith("Password strength")),
  ];

  order.forEach((fn, i) => {
    if (!fn(password)) unmet.add(i);
  });

  return (
    <ul className={cn("space-y-0.5 text-[11px]", className)}>
      {rules.map((rule, i) => {
        const ok = !unmet.has(i) && password.length > 0;
        return (
          <li
            key={rule}
            className={cn(
              "flex items-center gap-1.5",
              ok ? "text-green-600 dark:text-green-500" : "text-muted-foreground",
            )}
          >
            {ok ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0 opacity-60" />}
            {rule}
          </li>
        );
      })}
    </ul>
  );
}
