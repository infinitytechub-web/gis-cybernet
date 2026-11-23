import { moduleForPath } from "@/lib/rbac";
import { COMMAND_TIER_ROLES } from "@/lib/role-labels";

/**
 * Navigation-only visibility. Route guards and the database still enforce
 * access; this keeps the menu free of management areas a person has no use for.
 * - "self": the personal My Work section — every permitted item shows.
 * - "managed": Command / HR / Operations / Administration — open-to-everyone
 *   pages only show for command-tier roles, and unregistered paths only for
 *   Super Admins, so plain staff see just what they were specifically granted.
 */
export function showInNav(
  path: string,
  section: "self" | "managed",
  role: string | null,
  canPath: (p: string) => boolean,
): boolean {
  if (!canPath(path)) return false;
  if (section === "self" || role === "admin") return true;
  const mod = moduleForPath(path);
  if (!mod) return false;
  if (mod.tier === "all-staff") return COMMAND_TIER_ROLES.includes(role as never);
  return true;
}
