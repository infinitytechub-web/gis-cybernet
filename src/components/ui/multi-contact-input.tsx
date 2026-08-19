import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { GhanaPhoneInput } from "@/components/ui/ghana-phone-input";
import { ContactPhoneInput } from "@/components/ui/contact-phone-input";

export type ContactEntry = {
  id?: string;
  contact_type: string;
  label?: string | null;
  value: string;
  is_primary: boolean;
};

const CONTACT_TYPES = [
  { value: "mobile", label: "Mobile" },
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "emergency", label: "Emergency" },
  { value: "other", label: "Other" },
];

interface StructuredProps {
  mode?: "structured";
  value: ContactEntry[];
  onChange: (next: ContactEntry[]) => void;
  className?: string;
}

interface ListProps {
  mode: "list";
  /** Comma-separated string stored on the existing phone column */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  /** Enforce Ghana mobile validation (MTN / Telecel / AirtelTigo). */
  ghana?: boolean;
  /** Ghana rules for local/+233 numbers, sanity-checked foreign numbers allowed. */
  ghanaAware?: boolean;
}

type Props = StructuredProps | ListProps;

export function MultiContactInput(props: Props) {
  if (props.mode === "list") return <ListContacts {...props} />;
  return <StructuredContacts {...(props as StructuredProps)} />;
}

function StructuredContacts({ value, onChange, className }: StructuredProps) {
  const update = (idx: number, patch: Partial<ContactEntry>) => {
    const next = value.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const add = () =>
    onChange([
      ...value,
      { contact_type: "mobile", label: "", value: "", is_primary: value.length === 0 },
    ]);
  const setPrimary = (idx: number) =>
    onChange(value.map((c, i) => ({ ...c, is_primary: i === idx })));

  return (
    <div className={cn("space-y-2", className)}>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">No contacts yet. Add one below.</p>
      )}
      {value.map((c, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-3">
            <Select value={c.contact_type} onValueChange={(v) => update(idx, { contact_type: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            className="col-span-3 h-9"
            placeholder="Label (optional)"
            value={c.label ?? ""}
            onChange={(e) => update(idx, { label: e.target.value })}
          />
          <div className="col-span-4">
            <GhanaPhoneInput
              value={c.value}
              onChange={(v) => update(idx, { value: v })}
              compact
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant={c.is_primary ? "default" : "outline"}
            className="col-span-1 h-9 w-9"
            onClick={() => setPrimary(idx)}
            title={c.is_primary ? "Primary contact" : "Set as primary"}
          >
            <Star className={cn("h-4 w-4", c.is_primary && "fill-current")} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="col-span-1 h-9 w-9 text-destructive hover:text-destructive"
            onClick={() => remove(idx)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4 mr-1" /> Add contact
      </Button>
    </div>
  );
}

function ListContacts({ value, onChange, placeholder, className, ghana, ghanaAware }: ListProps) {
  // Keep empty entries so users can add multiple slots and fill them in any order.
  // Only trim/collapse on persistence (handled by callers when storing).
  const items = React.useMemo(() => {
    if (value === undefined || value === null) return [""];
    if (value === "") return [""];
    return value.split(",").map((v) => v.trim());
  }, [value]);

  const commit = (arr: string[]) => {
    // Preserve all slots (including empties) so the UI keeps the rows the user added.
    onChange(arr.join(", "));
  };

  const update = (idx: number, next: string) => {
    const arr = [...items];
    arr[idx] = next;
    commit(arr);
  };
  const remove = (idx: number) => {
    const arr = items.filter((_, i) => i !== idx);
    commit(arr.length === 0 ? [""] : arr);
  };
  const add = () => commit([...items, ""]);

  return (
    <div className={cn("space-y-2", className)}>
      {items.map((v, idx) => (
        <div key={idx} className="flex gap-2">
          {ghana ? (
            <div className="flex-1">
              <GhanaPhoneInput value={v} onChange={(next) => update(idx, next)} compact />
            </div>
          ) : ghanaAware ? (
            <div className="flex-1">
              <ContactPhoneInput value={v} onChange={(next) => update(idx, next)} compact />
            </div>
          ) : (
            <Input
              className="h-9"
              placeholder={placeholder ?? "0XX XXX XXXX"}
              value={v}
              onChange={(e) => update(idx, e.target.value)}
            />
          )}
          {items.length > 1 && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
              onClick={() => remove(idx)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4 mr-1" /> Add another number
      </Button>
    </div>
  );
}
