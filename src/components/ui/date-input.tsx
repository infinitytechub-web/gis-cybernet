import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, isValid, parse } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateInput } from "@/components/ui/date-input";

/**
 * Drop-in replacement for `<DateInput  />`.
 *
 * Native date inputs render in the BROWSER's locale (US machines show
 * MM/DD/YYYY), which breaks the house standard. This control always displays
 * and accepts DD/MM/YYYY while keeping the machine value ISO (`yyyy-MM-dd`),
 * so `value` / `onChange(e.target.value)` behave exactly as before.
 */

const ISO = "yyyy-MM-dd";
const DISPLAY = "dd/MM/yyyy";

function isoToDisplay(iso?: string | null): string {
  if (!iso) return "";
  const d = parse(String(iso).slice(0, 10), ISO, new Date());
  return isValid(d) ? format(d, DISPLAY) : "";
}

function displayToIso(text: string): string | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return null;
  const d = parse(text, DISPLAY, new Date());
  if (!isValid(d)) return null;
  // Reject overflow like 31/02/2026 (date-fns would roll it over).
  if (format(d, DISPLAY) !== text) return null;
  return format(d, ISO);
}

function maskInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

export type DateInputProps = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value?: string | null;
  onChange?: (event: { target: { value: string; name?: string } }) => void;
  /** ISO lower/upper bounds, same as the native input. */
  min?: string;
  max?: string;
};

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value, onChange, min, max, disabled, name, placeholder, ...props }, ref) => {
    const [text, setText] = React.useState(() => isoToDisplay(value));
    const [open, setOpen] = React.useState(false);

    // Keep the visible text in sync when the controlled value changes elsewhere.
    React.useEffect(() => {
      setText((prev) => (displayToIso(prev) === (value ? String(value).slice(0, 10) : null) ? prev : isoToDisplay(value)));
    }, [value]);

    const emit = (iso: string) => onChange?.({ target: { value: iso, name } });

    const handleText = (raw: string) => {
      const masked = maskInput(raw);
      setText(masked);
      const iso = displayToIso(masked);
      if (iso) emit(iso);
      else if (masked === "") emit("");
    };

    const selected = React.useMemo(() => {
      const iso = value ? String(value).slice(0, 10) : "";
      const d = iso ? parse(iso, ISO, new Date()) : null;
      return d && isValid(d) ? d : undefined;
    }, [value]);

    const minDate = min ? parse(min.slice(0, 10), ISO, new Date()) : undefined;
    const maxDate = max ? parse(max.slice(0, 10), ISO, new Date()) : undefined;

    return (
      <div className={cn("relative flex w-full items-center", className)}>
        <input
          {...props}
          ref={ref}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder ?? "DD/MM/YYYY"}
          value={text}
          onChange={(e) => handleText(e.target.value)}
          onBlur={(e) => {
            if (text && !displayToIso(text)) {
              setText(isoToDisplay(value));
            }
            props.onBlur?.(e);
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label="Open calendar (DD/MM/YYYY)"
              className="absolute right-0 h-10 w-10 text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              onSelect={(d) => {
                if (d && isValid(d)) {
                  setText(format(d, DISPLAY));
                  emit(format(d, ISO));
                }
                setOpen(false);
              }}
              disabled={
                minDate || maxDate
                  ? (d: Date) => (minDate && d < minDate) || (maxDate && d > maxDate) || false
                  : undefined
              }
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);
DateInput.displayName = "DateInput";

export { DateInput };
