/**
 * Searchable select used across the bio-data form for admin-managed lists
 * (regions, religions, relationships, banks, qualifications, and so on).
 * Type to search, press Enter to pick — works with a keyboard and on touch.
 */
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function OptionCombobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyText = "No match found.",
  disabled,
  id,
  className,
  allowCustom = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Lets the user keep a typed value that is not on the list. */
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value.toLowerCase() === (value ?? "").toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal h-9", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected?.label || value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to search…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value === value ? "" : o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  {o.label}
                </CommandItem>
              ))}
              {allowCustom && query.trim() && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()) && (
                <CommandItem
                  value={`__custom__${query}`}
                  onSelect={() => {
                    onChange(query.trim());
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  Use “{query.trim()}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default OptionCombobox;
