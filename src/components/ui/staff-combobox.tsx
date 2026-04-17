import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface StaffOption {
  id: string;
  first_name: string;
  last_name: string;
  staff_id: string;
}

interface StaffComboboxProps {
  staff: StaffOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** When true, renders a compact h-9 trigger to match form inputs */
  compact?: boolean;
  /** Optional: include an explicit "All staff" entry that maps to empty string */
  includeAllOption?: boolean;
  allOptionLabel?: string;
}

/**
 * Searchable combobox for selecting a staff member from the directory.
 * Supports search by first name, last name (including "Last, First" format),
 * full name, and staff ID. Use across all forms that pick a profile.
 */
export function StaffCombobox({
  staff,
  value,
  onValueChange,
  placeholder = "Search staff by name or ID…",
  emptyText = "No staff found.",
  disabled,
  className,
  compact = true,
  includeAllOption = false,
  allOptionLabel = "All staff",
}: StaffComboboxProps) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...staff].sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
      ),
    [staff]
  );

  const selected = useMemo(() => staff.find((s) => s.id === value), [staff, value]);

  const triggerLabel = selected
    ? `${selected.last_name}, ${selected.first_name} · ${selected.staff_id}`
    : value === "" && includeAllOption
    ? allOptionLabel
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            compact ? "h-9" : "h-10",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <UserCircle2 className="h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[280px] p-0"
        align="start"
      >
        <Command
          filter={(itemValue, search) => {
            // itemValue is the searchable string we set on each CommandItem
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Type a name or staff ID…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {includeAllOption && (
                <CommandItem
                  value="__all__ all staff everyone"
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === "" ? "opacity-100" : "opacity-0")} />
                  <span className="font-medium">{allOptionLabel}</span>
                </CommandItem>
              )}
              {sorted.map((p) => {
                const searchable = `${p.last_name} ${p.first_name} ${p.first_name} ${p.last_name} ${p.staff_id}`;
                return (
                  <CommandItem
                    key={p.id}
                    value={searchable}
                    onSelect={() => {
                      onValueChange(p.id === value ? "" : p.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", p.id === value ? "opacity-100" : "opacity-0")}
                    />
                    <span className="flex-1 truncate">
                      {p.last_name}, {p.first_name}
                    </span>
                    <span className="ml-2 text-[11px] font-mono text-muted-foreground shrink-0">
                      {p.staff_id}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
