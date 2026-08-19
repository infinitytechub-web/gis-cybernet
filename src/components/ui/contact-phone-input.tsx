import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Globe } from "lucide-react";
import {
  CONTACT_PHONE_HINT,
  GHANA_PHONE_PLACEHOLDER,
  formatGhanaPhone,
  validateContactPhone,
} from "@/lib/ghana-phone";
import { validateGhanaPhone } from "@/lib/ghana-phone";

interface ContactPhoneInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Hide the helper text row (used inside dense multi-contact lists). */
  compact?: boolean;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * Biodata contact field: full Ghana validation for local / +233 numbers,
 * sanity-checked acceptance of explicit foreign dialling codes. Rejects
 * fabricated patterns on both paths (mirrored server-side).
 */
export function ContactPhoneInput({
  value,
  onChange,
  compact,
  required,
  disabled,
  id,
  className,
  placeholder,
  ...rest
}: ContactPhoneInputProps) {
  const trimmed = (value ?? "").trim();
  const result = trimmed ? validateContactPhone(trimmed) : null;
  const gh = trimmed && result?.kind === "ghana" ? validateGhanaPhone(trimmed) : null;
  const invalid = Boolean(trimmed) && result?.valid === false;

  return (
    <div className="space-y-1">
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        placeholder={placeholder ?? `${GHANA_PHONE_PLACEHOLDER} or +44...`}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9", invalid && "border-destructive focus-visible:ring-destructive", className)}
        {...rest}
      />
      {invalid ? (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {result?.error}
        </p>
      ) : trimmed && result?.valid ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {result.kind === "ghana" ? (
            <>
              <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
              {gh?.network} · {formatGhanaPhone(trimmed)}
            </>
          ) : (
            <>
              <Globe className="h-3 w-3 shrink-0" /> International · {result.canonical}
            </>
          )}
        </p>
      ) : !compact ? (
        <p className="text-xs text-muted-foreground">{CONTACT_PHONE_HINT}</p>
      ) : null}
    </div>
  );
}
