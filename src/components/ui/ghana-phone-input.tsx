import * as React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  GHANA_PHONE_HINT,
  GHANA_PHONE_PLACEHOLDER,
  formatGhanaPhone,
  validateGhanaPhone,
} from "@/lib/ghana-phone";

interface GhanaPhoneInputProps {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Hide the helper/validation line (for dense table rows). */
  compact?: boolean;
}

/**
 * Masked Ghana telephone input with live network detection.
 * Accepts only digits (and a leading +), caps at 10 local digits and shows
 * the detected network once the full number is entered.
 */
export function GhanaPhoneInput({
  value,
  onChange,
  id,
  className,
  placeholder,
  disabled,
  required,
  compact,
}: GhanaPhoneInputProps) {
  const result = React.useMemo(() => validateGhanaPhone(value), [value]);
  const digits = (value ?? "").replace(/\D/g, "");
  const touched = digits.length > 0;
  const complete = digits.length >= 9;

  const handleChange = (raw: string) => {
    // Keep digits only; allow international entry then trim to the local form.
    let d = raw.replace(/\D/g, "");
    if (d.startsWith("00233")) d = `0${d.slice(5)}`;
    else if (d.startsWith("233")) d = `0${d.slice(3)}`;
    if (!d.startsWith("0") && d.length > 0) d = `0${d}`;
    d = d.slice(0, 10);
    // Pretty-print progressively: 024 123 4567
    const pretty = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" ");
    onChange(pretty);
  };

  const showError = touched && complete && !result.valid;
  const showWarn = result.valid && result.suspicious;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="relative">
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          disabled={disabled}
          required={required}
          aria-invalid={showError || undefined}
          aria-describedby={id ? `${id}-hint` : undefined}
          placeholder={placeholder ?? GHANA_PHONE_PLACEHOLDER}
          value={value ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            if (result.valid) onChange(formatGhanaPhone(result.local));
          }}
          className={cn(
            "pr-24",
            showError && "border-destructive focus-visible:ring-destructive",
          )}
        />
        {result.network && (
          <Badge
            variant="outline"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium"
          >
            {showWarn ? (
              <AlertTriangle className="mr-1 h-3 w-3 text-warning" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mr-1 h-3 w-3 text-success" aria-hidden="true" />
            )}
            {result.network}
          </Badge>
        )}
      </div>
      {!compact && (
        <p
          id={id ? `${id}-hint` : undefined}
          aria-live="polite"
          className={cn(
            "text-xs",
            showError ? "text-destructive" : showWarn ? "text-warning" : "text-muted-foreground",
          )}
        >
          {showError || showWarn ? result.error : GHANA_PHONE_HINT}
        </p>
      )}
    </div>
  );
}
