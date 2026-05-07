import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Ghana Card input with a fixed "GHA-" prefix.
 * Stores the full canonical value (e.g. "GHA-123456789-1") in form state,
 * but only allows the user to type the remaining digits/dash.
 *
 * Accepts an existing value with or without the GHA- prefix.
 */
export function GhanaCardInput({
  value,
  onChange,
  placeholder = "XXXXXXXXX-X",
  disabled,
  className,
  id,
}: {
  value: string;
  onChange: (fullValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const stripped = (value ?? "").replace(/^GHA-?/i, "");

  const handleChange = (raw: string) => {
    // Allow only digits and a single dash, uppercase, no leading dash
    const cleaned = raw
      .toUpperCase()
      .replace(/[^0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-/, "");
    if (cleaned === "") {
      onChange("");
    } else {
      onChange(`GHA-${cleaned}`);
    }
  };

  return (
    <div className={cn("flex items-stretch", className)}>
      <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-xs font-mono font-semibold text-muted-foreground">
        GHA-
      </span>
      <Input
        id={id}
        value={stripped}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-l-none font-mono"
        inputMode="numeric"
        maxLength={12}
      />
    </div>
  );
}
