import { useState, useEffect, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FeeInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * GHS-formatted currency input.
 * - Blocks non-numeric characters (allows one decimal point, max 2 decimal places).
 * - Formats to two decimals on blur.
 * - Stores the raw numeric string (e.g. "150.00") via onValueChange.
 */
export const FeeInput = forwardRef<HTMLInputElement, FeeInputProps>(
  ({ value, onValueChange, placeholder = "0.00", required, className, id, disabled }, ref) => {
    const [display, setDisplay] = useState(value);

    useEffect(() => {
      setDisplay(value);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow empty
      if (raw === "") {
        setDisplay("");
        onValueChange("");
        return;
      }
      // Permit only digits and at most one decimal point with up to 2 decimals
      if (!/^\d*\.?\d{0,2}$/.test(raw)) return;
      setDisplay(raw);
      onValueChange(raw);
    };

    const handleBlur = () => {
      if (display === "" || display === ".") {
        setDisplay("");
        onValueChange("");
        return;
      }
      const num = parseFloat(display);
      if (Number.isNaN(num)) {
        setDisplay("");
        onValueChange("");
        return;
      }
      const formatted = num.toFixed(2);
      setDisplay(formatted);
      onValueChange(formatted);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow control keys
      if (
        e.ctrlKey || e.metaKey || e.altKey ||
        ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
      ) return;
      // Block anything that isn't a digit or a single decimal point
      if (!/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        return;
      }
      if (e.key === "." && display.includes(".")) {
        e.preventDefault();
      }
    };

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
          GHS
        </span>
        <Input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={cn("pl-12 text-right tabular-nums", className)}
        />
      </div>
    );
  }
);
FeeInput.displayName = "FeeInput";
