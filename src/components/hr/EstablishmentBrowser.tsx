/**
 * ESTABLISHMENT BROWSER — the command hierarchy in its exact order, with the
 * number of staff posted to each node and the appointments held there:
 *
 *   The Directorate (HQ) → Management Members → Regional Commands →
 *   Commandant / ISA & CO / Assin Fosu, Tepa & ITTraS → Sector Commands →
 *   Departments → Sections → Units → All Controls
 *
 * Search narrows the tree while keeping each match's parents visible, so the
 * chain of command is never lost.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgUnits } from "@/hooks/useOrgScope";
import { QuickScroll } from "@/components/ui/quick-scroll";
import { useOrgPositions, POSITION_LEVEL_LABELS } from "@/components/org/OrgPositionsAdmin";
import {
  ORG_UNIT_TYPE_LABELS,
  buildOrgTree,
  flattenOrgTree,
  ancestorIds,
} from "@/lib/org-hierarchy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Network, Search } from "lucide-react";

export function EstablishmentBrowser() {
  const { data: units = [] } = useOrgUnits();
  const { data: positions = [] } = useOrgPositions();
  const [search, setSearch] = useState("");

  const staffCounts = useQuery({
    queryKey: ["hr-establishment-staff-counts"],
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("org_unit_id")
        .eq("status", "active");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const id = (row as { org_unit_id: string | null }).org_unit_id;
        if (id) map[id] = (map[id] ?? 0) + 1;
      }
      return map;
    },
  });

  const rows = useMemo(() => flattenOrgTree(buildOrgTree(units)), [units]);

  const positionsByUnit = useMemo(() => {
    const map = new Map<string, typeof positions>();
    for (const p of positions) {
      if (!p.org_unit_id) continue;
      const list = map.get(p.org_unit_id) ?? [];
      list.push(p);
      map.set(p.org_unit_id, list);
    }
    return map;
  }, [positions]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const keep = new Set<string>();
    for (const node of rows) {
      const hit = [node.name, node.code, ORG_UNIT_TYPE_LABELS[node.type]]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
      if (hit) {
        keep.add(node.id);
        for (const a of ancestorIds(units, node.id)) keep.add(a);
      }
    }
    return rows.filter((n) => keep.has(n.id));
  }, [rows, search, units]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4 text-blue-700 dark:text-blue-300" aria-hidden="true" />
          Establishment hierarchy
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Directorate down to controls, with staff posted and appointments held at
          each level.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="pl-9"
            placeholder="Search the hierarchy…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search the establishment hierarchy"
          />
        </div>
        <div className="relative overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Command</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="text-right">Staff posted</TableHead>
                <TableHead>Appointments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No part of the hierarchy matches that search.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((node) => {
                const held = positionsByUnit.get(node.id) ?? [];
                return (
                  <TableRow key={node.id}>
                    <TableCell className="font-medium">
                      <span style={{ paddingLeft: `${node.depth * 14}px` }} className="block truncate">
                        {node.depth > 0 && (
                          <span aria-hidden="true" className="text-muted-foreground">└ </span>
                        )}
                        {node.name}
                      </span>
                      <span
                        style={{ paddingLeft: `${node.depth * 14}px` }}
                        className="block text-xs text-muted-foreground"
                      >
                        {node.code}
                      </span>
                    </TableCell>
                    <TableCell>{ORG_UNIT_TYPE_LABELS[node.type]}</TableCell>
                    <TableCell className="text-right">
                      {staffCounts.data?.[node.id] ?? 0}
                    </TableCell>
                    <TableCell className="space-y-1">
                      {held.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None recorded</span>
                      ) : (
                        held.map((p) => (
                          <span key={p.id} className="block text-xs">
                            <span className="font-medium">{p.title}</span>{" "}
                            <span className="text-muted-foreground">
                              ({POSITION_LEVEL_LABELS[p.position_level]})
                            </span>{" "}
                            {p.is_vacant ? (
                              <Badge variant="destructive" className="ml-1">Vacant</Badge>
                            ) : (
                              <span>— {p.holder_rank ? `${p.holder_rank} ` : ""}{p.holder_name}</span>
                            )}
                          </span>
                        ))
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <QuickScroll label="hierarchy list" threshold={600} />
        </div>
      </CardContent>
    </Card>
  );
}
