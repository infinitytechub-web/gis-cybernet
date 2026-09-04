/**
 * COMMAND PICKER — one compact, searchable control for choosing any node of the
 * establishment, in the exact order:
 *   Directorate (HQ) → Management Members → Regional Commands →
 *   Commandant / ISA & CO / Assin Fosu, Tepa & ITTraS → Sector Commands →
 *   Departments → Sections → Units → Controls.
 *
 * Used by the Staff Roster, the HR hub and the positions register so all three
 * filter the same way. Selecting a node means "this node and everything below
 * it" — the caller decides with `descendantIds`.
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ORG_UNIT_TYPE_LABELS,
  buildOrgTree,
  flattenOrgTree,
  type OrgUnit,
} from "@/lib/org-hierarchy";

export function CommandPicker({
  units,
  value,
  onChange,
  placeholder = "All commands",
  allLabel = "All commands",
  disabled,
  className,
  id,
  allowAll = true,
}: {
  units: OrgUnit[];
  /** Selected unit id, or "" / null for "all". */
  value: string | null;
  onChange: (unitId: string | null) => void;
  placeholder?: string;
  allLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  allowAll?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => flattenOrgTree(buildOrgTree(units)), [units]);
  const selected = rows.find((r) => r.id === value) ?? null;

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
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Network className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{selected ? selected.name : placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search command, department, section or unit…" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No command found.</CommandEmpty>
            <CommandGroup>
              {allowAll && (
                <CommandItem
                  value={allLabel}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                  {allLabel}
                </CommandItem>
              )}
              {rows.map((node) => (
                <CommandItem
                  key={node.id}
                  value={`${node.name} ${node.code} ${ORG_UNIT_TYPE_LABELS[node.type]}`}
                  onSelect={() => {
                    onChange(node.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === node.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span
                    style={{ paddingLeft: `${node.depth * 12}px` }}
                    className="flex min-w-0 flex-col"
                  >
                    <span className="truncate">
                      {node.depth > 0 && (
                        <span aria-hidden="true" className="text-muted-foreground">└ </span>
                      )}
                      {node.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {ORG_UNIT_TYPE_LABELS[node.type]} · {node.code}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
