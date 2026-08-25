/**
 * Configurable employee-ID anonymisation.
 *
 * Administrators control how staff identifiers are rendered per role and per
 * context (dashboard tiles, staff directory, exports, printed sheets) from
 * Settings → Security → Anonymisation. The rules live on the app settings row
 * (`staff_id_mask_rules`) and are read by every screen through
 * `useStaffIdDisplay`, so an identifier can never appear unmasked on one widget
 * and masked on another.
 */

export type StaffIdMaskMode = "full" | "partial" | "hidden";

/** Where the identifier is being rendered. */
export type StaffIdContext = "dashboard" | "directory" | "export" | "print";

export const STAFF_ID_CONTEXTS: { value: StaffIdContext; label: string; description: string }[] = [
  { value: "dashboard", label: "Dashboard tiles", description: "Widgets and summary cards on the general dashboard." },
  { value: "directory", label: "Staff directory & tables", description: "Staff lists, rosters and record tables." },
  { value: "export", label: "Exports (CSV/PDF)", description: "Downloaded files that leave the application." },
  { value: "print", label: "Printed sheets", description: "Print layouts such as rosters and letters." },
];

export const STAFF_ID_MASK_MODES: { value: StaffIdMaskMode; label: string }[] = [
  { value: "full", label: "Show full identifier" },
  { value: "partial", label: "Partially mask" },
  { value: "hidden", label: "Hide completely" },
];

export interface StaffIdMaskPattern {
  mode: StaffIdMaskMode;
  /** Leading characters kept visible (partial mode). */
  head: number;
  /** Trailing characters kept visible (partial mode). */
  tail: number;
  /** Character used for the masked run. */
  char: string;
}

export interface StaffIdMaskRules {
  /** Roles that always see the unmasked identifier. */
  full_roles: string[];
  /** Staff always see their own identifier in full. */
  owner_sees_full: boolean;
  /** Fallback pattern when nothing more specific matches. */
  default: StaffIdMaskPattern;
  /** Keyed by role (`supervisor`) or role+context (`supervisor:export`). */
  role_overrides: Record<string, StaffIdMaskPattern>;
  /** Keyed by context (`export`). */
  context_overrides: Record<string, StaffIdMaskPattern>;
}

export const REDACTED_ID = "•••••";

export const DEFAULT_STAFF_ID_MASK_RULES: StaffIdMaskRules = {
  full_roles: ["admin", "oic", "2ic"],
  owner_sees_full: true,
  default: { mode: "partial", head: 3, tail: 2, char: "•" },
  role_overrides: {},
  context_overrides: {
    export: { mode: "partial", head: 0, tail: 2, char: "•" },
  },
};

const FULL_PATTERN: StaffIdMaskPattern = { mode: "full", head: 0, tail: 0, char: "•" };

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function normalizePattern(raw: unknown, fallback = DEFAULT_STAFF_ID_MASK_RULES.default): StaffIdMaskPattern {
  const src = (raw ?? {}) as Partial<StaffIdMaskPattern>;
  const mode: StaffIdMaskMode =
    src.mode === "full" || src.mode === "hidden" || src.mode === "partial" ? src.mode : fallback.mode;
  const char = typeof src.char === "string" && src.char.length === 1 ? src.char : fallback.char;
  return {
    mode,
    head: clampInt(src.head, 0, 8, fallback.head),
    tail: clampInt(src.tail, 0, 8, fallback.tail),
    char,
  };
}

function normalizePatternMap(raw: unknown): Record<string, StaffIdMaskPattern> {
  const out: Record<string, StaffIdMaskPattern> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue;
    out[key] = normalizePattern(value);
  }
  return out;
}

/** Accepts whatever is stored in settings and returns a safe, complete rule set. */
export function normalizeStaffIdMaskRules(raw: unknown): StaffIdMaskRules {
  if (!raw || typeof raw !== "object") return DEFAULT_STAFF_ID_MASK_RULES;
  const src = raw as Partial<StaffIdMaskRules>;
  return {
    full_roles: Array.isArray(src.full_roles)
      ? src.full_roles.filter((r): r is string => typeof r === "string" && r.length > 0)
      : DEFAULT_STAFF_ID_MASK_RULES.full_roles,
    owner_sees_full: src.owner_sees_full !== false,
    default: normalizePattern(src.default),
    role_overrides: normalizePatternMap(src.role_overrides),
    context_overrides: normalizePatternMap(src.context_overrides),
  };
}

export interface StaffIdMaskContext {
  role?: string | null;
  context?: StaffIdContext;
  /** The viewer is the owner of this identifier. */
  isOwner?: boolean;
  /** Delegated grant that lifts identity masking (e.g. `field:identity`). */
  hasIdentityGrant?: boolean;
}

/**
 * Resolves the pattern that applies to a viewer, most specific rule first:
 * role+context override → role override → full-access role → context override →
 * default. Owners (when allowed) and identity grants short-circuit to full.
 */
export function resolveStaffIdPattern(rules: StaffIdMaskRules, ctx: StaffIdMaskContext): StaffIdMaskPattern {
  const role = ctx.role ?? "";
  const context = ctx.context ?? "dashboard";

  if (role) {
    const scoped = rules.role_overrides[`${role}:${context}`];
    if (scoped) return scoped;
    const roleRule = rules.role_overrides[role];
    if (roleRule) return roleRule;
  }

  if (ctx.hasIdentityGrant) return FULL_PATTERN;
  if (ctx.isOwner && rules.owner_sees_full) return FULL_PATTERN;
  if (role && rules.full_roles.includes(role)) return FULL_PATTERN;

  return rules.context_overrides[context] ?? rules.default;
}

/** Applies a resolved pattern to a raw identifier. */
export function applyStaffIdPattern(value: unknown, pattern: StaffIdMaskPattern): string {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (!raw) return "—";
  if (pattern.mode === "full") return raw;
  if (pattern.mode === "hidden") return REDACTED_ID;

  const compact = raw.replace(/\s+/g, "");
  const head = Math.min(pattern.head, compact.length);
  const tail = Math.min(pattern.tail, Math.max(0, compact.length - head));
  const hiddenCount = compact.length - head - tail;
  // Too short to keep anything meaningful hidden → redact entirely.
  if (hiddenCount < 2) return REDACTED_ID;
  return `${compact.slice(0, head)}${pattern.char.repeat(hiddenCount)}${tail > 0 ? compact.slice(-tail) : ""}`;
}

/** One-shot helper: resolve then apply. */
export function maskStaffId(value: unknown, rules: StaffIdMaskRules, ctx: StaffIdMaskContext): string {
  return applyStaffIdPattern(value, resolveStaffIdPattern(rules, ctx));
}

export function describePattern(pattern: StaffIdMaskPattern): string {
  if (pattern.mode === "full") return "Full identifier";
  if (pattern.mode === "hidden") return "Hidden";
  return `First ${pattern.head} + last ${pattern.tail} visible`;
}
