import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OTHER_AGENCY } from "./detention-options";

/**
 * Referral field: a standard list of institutions/commands plus an
 * "Other Agency or Command" option that reveals a mandatory free-text field
 * for the specific agency/command name.
 */
export function ReferralSelect({
  id,
  label,
  value,
  other,
  options,
  onChange,
  onOtherChange,
  placeholder = "Select",
}: {
  id: string;
  label: string;
  value: string;
  other: string;
  options: string[];
  onChange: (v: string) => void;
  onOtherChange: (v: string) => void;
  placeholder?: string;
}) {
  const isOther = value === OTHER_AGENCY;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => { const next = v === "none" ? "" : v; onChange(next); if (next !== OTHER_AGENCY) onOtherChange(""); }}>
        <SelectTrigger id={id}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Not specified —</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
      {isOther && (
        <div className="pt-1">
          <Label htmlFor={`${id}-other`} className="text-xs">Agency/Command Name *</Label>
          <Input
            id={`${id}-other`}
            value={other}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Specify the agency or command"
            aria-invalid={!other.trim()}
          />
          {!other.trim() && <p className="text-xs text-destructive mt-1">Agency/Command name is required.</p>}
        </div>
      )}
    </div>
  );
}
