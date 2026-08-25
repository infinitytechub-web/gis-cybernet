/**
 * FIELD-LEVEL VISIBILITY — need-to-know layer on top of module RBAC.
 *
 * Module RBAC (`src/lib/rbac.ts`) decides whether a role may *open* a screen.
 * This layer decides whether a role may see the *full value* of a sensitive
 * field on that screen. Everything else is masked/redacted, so a role that
 * legitimately needs a list (e.g. a shift leader reading a roster) does not
 * incidentally harvest identity, medical or financial data.
 *
 * Rules, in order:
 *   1. The record's owner always sees their own values.
 *   2. Admin / OIC / 2IC (the administration tier) see everything.
 *   3. Otherwise: the field's own `roles` allow-list decides.
 *   4. An active delegated capability (`field:<group>` or `*`) also allows.
 *
 * Pure functions only — unit-tested in `src/test/field-visibility.test.ts`.
 * This is a confidentiality control for the UI; RLS and the SECURITY DEFINER
 * RPCs remain the enforcement boundary for the data itself.
 */

import type { AppRole } from "@/lib/types";
import { COMMAND_TIER_ROLES } from "@/lib/role-labels";

/** Logical grouping of sensitive fields, used for grants and audit reasons. */
export type SensitiveGroup =
  | "contact"
  | "identity"
  | "medical"
  | "detainee"
  | "next_of_kin"
  | "financial";

export type SensitiveField =
  // contact
  | "phone"
  | "personal_email"
  | "address"
  // identity
  | "ghana_card"
  | "date_of_birth"
  | "passport_number"
  | "staff_identifier"
  // medical
  | "medical_record"
  | "medical_diagnosis"
  // detainee
  | "detainee_identity"
  | "detainee_contact"
  // next of kin
  | "next_of_kin"
  // financial
  | "amount"
  | "budget"
  | "vendor_details";

const ADMIN_TIER: AppRole[] = ["admin", "oic", "2ic"];

/** Full command tier — oversight roles above shift leadership. */
const COMMAND: AppRole[] = [...COMMAND_TIER_ROLES];

const SHIFT_LEADERSHIP: AppRole[] = [
  "shift_supervisor",
  "deputy_shift_supervisor",
  "shift_leader",
  "deputy_shift_leader",
  "deputy_supervisor",
  "deputy",
];

interface FieldDef {
  group: SensitiveGroup;
  /** Human label used in the reveal audit entry and the masked tooltip. */
  label: string;
  /** Roles with a standing need-to-know for the full value. */
  roles: AppRole[];
  /** How the masked form is rendered. */
  mask: "tail" | "email" | "full" | "date" | "id";
}

export const SENSITIVE_FIELDS: Record<SensitiveField, FieldDef> = {
  // ── Contact ──────────────────────────────────────────────────────────────
  phone: { group: "contact", label: "Phone number", roles: [...COMMAND, ...SHIFT_LEADERSHIP], mask: "tail" },
  personal_email: { group: "contact", label: "Personal email", roles: COMMAND, mask: "email" },
  address: { group: "contact", label: "Residential address", roles: COMMAND, mask: "full" },

  // ── Identity ─────────────────────────────────────────────────────────────
  ghana_card: { group: "identity", label: "Ghana Card number", roles: COMMAND, mask: "tail" },
  date_of_birth: { group: "identity", label: "Date of birth", roles: [...COMMAND, ...SHIFT_LEADERSHIP], mask: "date" },
  passport_number: { group: "identity", label: "Passport number", roles: [...COMMAND, "front_desk", "head_of_processing", "deputy_head_of_processing"], mask: "tail" },

  // ── Medical ──────────────────────────────────────────────────────────────
  medical_record: { group: "medical", label: "Medical record", roles: [...ADMIN_TIER, "medical_officer"], mask: "full" },
  medical_diagnosis: { group: "medical", label: "Diagnosis", roles: [...ADMIN_TIER, "medical_officer"], mask: "full" },

  // ── Detainee ─────────────────────────────────────────────────────────────
  detainee_identity: { group: "detainee", label: "Detainee identity details", roles: [...COMMAND, ...SHIFT_LEADERSHIP, "special_duties"], mask: "tail" },
  detainee_contact: { group: "detainee", label: "Detainee contact", roles: [...COMMAND, "special_duties"], mask: "tail" },

  // ── Next of kin ──────────────────────────────────────────────────────────
  next_of_kin: { group: "next_of_kin", label: "Next of kin", roles: COMMAND, mask: "full" },

  // ── Financial ────────────────────────────────────────────────────────────
  amount: { group: "financial", label: "Amount", roles: [...COMMAND, "procurement_officer", "storekeeper"], mask: "full" },
  budget: { group: "financial", label: "Unit budget", roles: [...COMMAND, "procurement_officer"], mask: "full" },
  vendor_details: { group: "financial", label: "Vendor details", roles: [...COMMAND, "procurement_officer", "storekeeper"], mask: "full" },
};

export interface FieldContext {
  role: AppRole | null;
  /** Active delegated capabilities (`command_tier_grants`). */
  capabilities?: string[];
  /** True when the signed-in user is the subject of the record. */
  isOwner?: boolean;
}

/** May this role see the unmasked value of `field`? */
export function canSeeField(field: SensitiveField, ctx: FieldContext): boolean {
  const def = SENSITIVE_FIELDS[field];
  if (!def) return true; // unknown field → not classified as sensitive
  if (ctx.isOwner) return true;
  const { role, capabilities } = ctx;
  if (!role) return false;
  if (ADMIN_TIER.includes(role)) return true;
  if (def.roles.includes(role)) return true;
  return !!capabilities?.some((c) => c === "*" || c === `field:${def.group}` || c === `field:${field}`);
}

/** Roles that may reveal a masked value on demand (audited) — same allow-list. */
export function canRevealField(field: SensitiveField, ctx: FieldContext): boolean {
  return canSeeField(field, ctx);
}

const REDACTED = "••••••••";

/** Render the masked form of a value. Never returns any part of a `full` mask. */
export function maskValue(field: SensitiveField, value: unknown): string {
  const def = SENSITIVE_FIELDS[field];
  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (!raw) return "—";
  if (!def) return raw;

  switch (def.mask) {
    case "tail": {
      const digits = raw.replace(/\s+/g, "");
      if (digits.length <= 4) return REDACTED;
      const head = digits.slice(0, Math.min(4, digits.length - 4));
      const tail = digits.slice(-2);
      return `${head}${"*".repeat(Math.max(4, digits.length - head.length - tail.length))}${tail}`;
    }
    case "email": {
      const [user, domain] = raw.split("@");
      if (!domain) return REDACTED;
      const shown = user.slice(0, 1);
      return `${shown}${"*".repeat(Math.max(3, user.length - 1))}@${domain}`;
    }
    case "date":
      return "••/••/••••";
    case "full":
    default:
      return REDACTED;
  }
}

/** Convenience: the value to display, masked unless the viewer may see it. */
export function displayField(field: SensitiveField, value: unknown, ctx: FieldContext): string {
  if (canSeeField(field, ctx)) {
    const raw = value === null || value === undefined ? "" : String(value);
    return raw.trim() === "" ? "—" : raw;
  }
  return maskValue(field, value);
}

export function fieldLabel(field: SensitiveField): string {
  return SENSITIVE_FIELDS[field]?.label ?? field;
}
