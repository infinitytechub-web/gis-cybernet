// src/components/applications/ProcessingChecklist.tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

export interface ChecklistItem { key: string; label: string; }

export const VISA_CHECKLIST: ChecklistItem[] = [
  { key: "passport_verified", label: "Passport verified (validity ≥ 6 months)" },
  { key: "biometrics_captured", label: "Biometrics captured" },
  { key: "interview_completed", label: "Applicant interview completed" },
  { key: "documents_complete", label: "All required documents present & legible" },
  { key: "fee_verified", label: "Fee receipt verified against GRA" },
  { key: "watchlist_check", label: "Watchlist / security clearance check passed" },
];

export const PERMIT_CHECKLIST: ChecklistItem[] = [
  ...VISA_CHECKLIST,
  { key: "sponsor_verified", label: "Employer / sponsor verified" },
  { key: "labour_quota_ok", label: "Labour quota / GIPC clearance confirmed" },
  { key: "medical_ok", label: "Medical fitness confirmed" },
  { key: "police_clearance_ok", label: "Police clearance confirmed" },
];

export const PASSPORT_CHECKLIST: ChecklistItem[] = [
  { key: "ghana_card_verified", label: "Ghana Card verified via NIA" },
  { key: "birth_cert_verified", label: "Birth certificate verified" },
  { key: "guarantor_verified", label: "Guarantors verified" },
  { key: "biometrics_captured", label: "Biometrics & photo captured" },
  { key: "fee_verified", label: "Fee receipt verified" },
  { key: "duplicate_check", label: "No duplicate / fraud match" },
];

interface Props {
  items: ChecklistItem[];
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  disabled?: boolean;
}

export function ProcessingChecklist({ items, value, onChange, disabled }: Props) {
  const completed = items.filter((i) => value[i.key]).length;
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Processing Checklist
        </div>
        <span className="text-xs text-muted-foreground">{completed}/{items.length} complete</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {items.map((item) => (
          <label key={item.key} className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={!!value[item.key]}
              onCheckedChange={(c) => onChange({ ...value, [item.key]: !!c })}
              disabled={disabled}
              className="mt-0.5"
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
