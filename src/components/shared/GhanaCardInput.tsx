import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

/**
 * Canonical Ghana Card format: GHA-XXXXXXXXX-X
 *  - 9 digits, dash, 1 check digit (also a digit)
 *  - "GHA-" prefix is fixed
 */
const GHANA_CARD_REGEX = /^GHA-\d{9}-\d$/;

export function isValidGhanaCard(value: string | null | undefined): boolean {
  if (!value) return false;
  return GHANA_CARD_REGEX.test(value.trim().toUpperCase());
}

/** Returns "" if blank, else a friendly error message, else null when valid. */
export function ghanaCardError(value: string | null | undefined, required = false): string | null {
  const v = (value ?? "").trim();
  if (!v) return required ? "Ghana Card number is required" : null;
  if (!isValidGhanaCard(v)) return "Format must be GHA-XXXXXXXXX-X (9 digits, dash, 1 digit)";
  return null;
}

/**
 * Ghana Card input with a fixed "GHA-" prefix and strict format validation.
 * - Auto-inserts the dash after 9 digits
 * - Blocks any non-digit character
 * - Caps total length at 10 digits (9 + 1 check digit)
 * - Shows an inline error when the user has typed something but it isn't yet valid
 */
export function GhanaCardInput({
  value,
  onChange,
  placeholder = "XXXXXXXXX-X",
  disabled,
  className,
  id,
  required,
}: {
  value: string;
  onChange: (fullValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
}) {
  const [touched, setTouched] = useState(false);

  // Strip GHA- prefix and any non-digit so we work with raw digits only
  const rawDigits = (value ?? "")
    .replace(/^GHA-?/i, "")
    .replace(/\D/g, "")
    .slice(0, 10);

  // Display: insert dash after 9 digits
  const display =
    rawDigits.length > 9
      ? `${rawDigits.slice(0, 9)}-${rawDigits.slice(9, 10)}`
      : rawDigits;

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    if (digits === "") {
      onChange("");
      return;
    }
    const formatted =
      digits.length > 9
        ? `GHA-${digits.slice(0, 9)}-${digits.slice(9, 10)}`
        : `GHA-${digits}`;
    onChange(formatted);
  };

  const error = touched ? ghanaCardError(value, required) : null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-stretch">
        <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-xs font-mono font-semibold text-muted-foreground">
          GHA-
        </span>
        <Input
          id={id}
          value={display}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={!!error}
          className={cn(
            "rounded-l-none font-mono",
            error && "border-destructive focus-visible:ring-destructive"
          )}
          inputMode="numeric"
          autoComplete="off"
          maxLength={11} // 9 digits + dash + 1 digit
        />
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
