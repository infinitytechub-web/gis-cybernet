import { buildOrgTree, ORG_UNIT_TYPE_LABELS, type OrgTreeNode, type OrgUnit, type OrgUnitType } from "@/lib/org-hierarchy";
import type { RegionalCommandCard } from "@/lib/regional-commands";

/** Org unit with the extra fields the hierarchy view renders. */
export interface HierarchyUnit extends OrgUnit {
  display_order: number | null;
  activation_status: string;
  brand_color: string | null;
}

export type HierarchyNode = OrgTreeNode & HierarchyUnit & { children: HierarchyNode[] };

/** Build the full org tree, siblings ordered by saved display order first. */
export function buildHierarchyTree(units: HierarchyUnit[]): HierarchyNode[] {
  const roots = buildOrgTree(units as OrgUnit[]) as HierarchyNode[];
  const sortRec = (nodes: HierarchyNode[]) => {
    nodes.sort((a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** Depth-first id list — the global display order persisted to the backend. */
export function flattenedIds(roots: HierarchyNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: HierarchyNode[]) => {
    for (const n of nodes) { out.push(n.id); walk(n.children); }
  };
  walk(roots);
  return out;
}

/**
 * Reorder one node among its own siblings only. Returns the new sibling id
 * order, or null when the two nodes have different parents — moving a node
 * under another command would change reporting relationships, which this
 * view never does.
 */
export function moveWithinSiblings(roots: HierarchyNode[], activeId: string, overId: string): HierarchyNode[] | null {
  const parentOf = new Map<string, HierarchyNode | null>();
  const walk = (nodes: HierarchyNode[], parent: HierarchyNode | null) => {
    for (const n of nodes) { parentOf.set(n.id, parent); walk(n.children, n); }
  };
  walk(roots, null);
  const parent = parentOf.get(activeId);
  if (parent === undefined || parentOf.get(overId) !== parent) return null;
  const siblings = parent ? parent.children : roots;
  const a = siblings.findIndex((n) => n.id === activeId);
  const b = siblings.findIndex((n) => n.id === overId);
  if (a < 0 || b < 0) return null;
  const next = [...siblings];
  const [moved] = next.splice(a, 1);
  next.splice(b, 0, moved);
  if (parent) parent.children = next;
  return parent ? roots : next;
}

/** Visible rows of the tree with collapsed branches hidden, depth-first. */
export function visibleNodes(roots: HierarchyNode[], collapsed: Set<string>): HierarchyNode[] {
  const out: HierarchyNode[] = [];
  const walk = (nodes: HierarchyNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (!collapsed.has(n.id)) walk(n.children);
    }
  };
  walk(roots);
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const wordShell = (body: string) => `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
h1 { font-size: 16pt; text-align: center; margin-bottom: 2pt; }
p.sub { text-align: center; font-style: italic; margin-top: 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #999; padding: 4pt 6pt; text-align: left; }
th { background: #e6efe6; }
tr.pending td { color: #777; }
p.footer { text-align: center; font-size: 8pt; letter-spacing: 2pt; color: #555; margin-top: 14pt; }
</style></head><body>${body}</body></html>`;

/** Word-compatible HTML document for the regional command cards list. */
export function buildCommandsWordHtml(cards: RegionalCommandCard[], generatedAt: Date): string {
  const rows = cards.map((c, i) => `<tr class="${c.activation_status === "active" ? "active" : "pending"}"><td>${i + 1}</td><td>${esc(c.name)}</td><td>${c.activation_status === "active" ? "Active" : "Pending activation"}</td><td>${c.staff_count ?? "—"}</td></tr>`).join("");
  return wordShell(`
<h1>GHANA IMMIGRATION SERVICE — REGIONAL COMMANDS LIST</h1>
<p class="sub">Friendship With Vigilance</p>
<p>Generated ${esc(generatedAt.toLocaleString("en-GB"))}</p>
<table><tr><th>#</th><th>Command</th><th>Status</th><th>Staff</th></tr>${rows}</table>
<p class="footer">SECURE BORDERS • SAFE COMMUNITIES • A STRONGER GHANA</p>`);
}

/** Word-compatible HTML document for the full command hierarchy. */
export function buildHierarchyWordHtml(roots: HierarchyNode[], generatedAt: Date): string {
  const lines: string[] = [];
  const walk = (nodes: HierarchyNode[]) => {
    for (const n of nodes) {
      const label = ORG_UNIT_TYPE_LABELS[n.type as OrgUnitType] ?? n.type;
      const status = n.activation_status === "active" ? "" : " (pending activation)";
      lines.push(`<p style="margin:0;padding-left:${n.depth * 18}pt">${n.children.length ? "<b>" : ""}${esc(n.name)}${n.children.length ? "</b>" : ""} — ${esc(label)}${status}</p>`);
      walk(n.children);
    }
  };
  walk(roots);
  return wordShell(`
<h1>GHANA IMMIGRATION SERVICE — COMMAND HIERARCHY</h1>
<p class="sub">Friendship With Vigilance</p>
<p>Generated ${esc(generatedAt.toLocaleString("en-GB"))}</p>
${lines.join("\n")}
<p class="footer">SECURE BORDERS • SAFE COMMUNITIES • A STRONGER GHANA</p>`);
}
