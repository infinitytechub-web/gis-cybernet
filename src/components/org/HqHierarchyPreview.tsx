import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ORG_UNIT_TYPE_LABELS,
  buildOrgTree,
  hqWrapperIds,
  type OrgTreeNode,
  type OrgUnit,
} from "@/lib/org-hierarchy";

interface Props {
  units: OrgUnit[];
  /** Staff posted per unit id (optional). */
  staffCounts?: Map<string, number>;
}

/**
 * Read-only preview of how commands sit under HQ. "As shown in filters" is the
 * folded view every selector uses; "Actual structure" shows real parent links.
 * Nothing here edits the organization.
 */
export function HqHierarchyPreview({ units, staffCounts }: Props) {
  const [mode, setMode] = useState<"display" | "actual">("display");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const wrappers = useMemo(() => hqWrapperIds(units), [units]);
  const tree = useMemo(
    () => buildOrgTree(units, { collapseHq: mode === "display" }),
    [units, mode],
  );

  const q = search.trim().toLowerCase();
  const matches = (n: OrgTreeNode): boolean =>
    !q || n.name.toLowerCase().includes(q) || n.children.some(matches);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const renderNode = (n: OrgTreeNode): JSX.Element | null => {
    if (!matches(n)) return null;
    const open = q ? true : !collapsed.has(n.id);
    const hasKids = n.children.length > 0;
    return (
      <li key={n.id}>
        <div
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
          style={{ paddingLeft: `${n.depth * 20 + 8}px` }}
        >
          {hasKids ? (
            <button
              type="button"
              onClick={() => toggle(n.id)}
              aria-label={open ? `Collapse ${n.name}` : `Expand ${n.name}`}
              aria-expanded={open}
              className="text-muted-foreground"
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className={n.depth === 0 ? "font-semibold" : "text-sm"}>{n.name}</span>
          <Badge variant="outline" className="text-[10px]">
            {ORG_UNIT_TYPE_LABELS[n.type]}
          </Badge>
          {mode === "actual" && wrappers.has(n.id) && (
            <Badge variant="secondary" className="text-[10px]">Folded into HQ in filters</Badge>
          )}
          {!n.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
          {staffCounts && (
            <span className="ml-auto text-xs text-muted-foreground">
              {staffCounts.get(n.id) ?? 0} staff
            </span>
          )}
        </div>
        {hasKids && open && <ul>{n.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" aria-hidden="true" /> Hierarchy preview
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Review where each command sits under HQ before changing the structure. This preview
          changes nothing.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "display" | "actual")}>
            <TabsList>
              <TabsTrigger value="display">As shown in filters</TabsTrigger>
              <TabsTrigger value="actual">Actual structure</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a command…"
              className="pl-8"
              aria-label="Find a command in the preview"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[480px] overflow-auto rounded-md border p-2">
          {tree.length ? (
            <ul>{tree.map(renderNode)}</ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No commands to show.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
