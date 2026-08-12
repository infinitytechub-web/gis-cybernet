import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Search, UserCheck, X } from "lucide-react";
import { roleLabel } from "@/lib/role-labels";

export type StaffOption = {
  id: string;
  staff_id: string | null;
  first_name: string;
  last_name: string;
  status: string | null;
  rank_abbrev: string | null;
  rank_name: string | null;
  department: string | null;
  unit: string | null;
  role: string | null;
};

export function staffDisplay(o: StaffOption) {
  const rank = o.rank_abbrev || o.rank_name || "";
  return `${rank ? rank + " " : ""}${o.first_name} ${o.last_name}`.trim();
}

/**
 * Searchable staff directory picker used across the detention module.
 *
 * The list is loaded live from `profiles` (never hard-coded), so newly
 * registered staff appear automatically. By default only staff whose status is
 * `active` are selectable — inactive/transferred personnel are shown only when
 * `includeInactive` is set (e.g. when displaying a historical selection).
 * RLS keeps restricted directory data out of unauthorised hands and, for the
 * statement approver, a database trigger re-checks authority server-side.
 */
export function StaffPicker({
  value,
  label,
  onChange,
  canEdit = true,
  title = "Select staff",
  placeholder = "Select staff member…",
  includeInactive = false,
  icon,
}: {
  /** profiles.id of the selected staff member */
  value: string | null;
  /** Display snapshot stored alongside the id */
  label: string | null;
  onChange: (id: string | null, label: string | null) => void;
  canEdit?: boolean;
  title?: string;
  placeholder?: string;
  includeInactive?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: staff = [], isLoading, isError } = useQuery({
    queryKey: ["detention-staff-options", includeInactive],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      let q = (supabase.from("profiles") as any)
        .select("id, staff_id, first_name, last_name, status, unit, ranks(abbreviation, name), departments(name), user_roles(role)")
        .order("last_name")
        .limit(2000);
      if (!includeInactive) q = q.eq("status", "active");
      const { data, error } = await q;
      if (error) throw error;
      const seen = new Set<string>();
      return ((data ?? []) as any[])
        .filter((p) => (p.id && !seen.has(p.id) ? (seen.add(p.id), true) : false))
        .map((p) => ({
          id: p.id,
          staff_id: p.staff_id ?? null,
          first_name: p.first_name,
          last_name: p.last_name,
          status: p.status ?? null,
          rank_abbrev: p.ranks?.abbreviation ?? null,
          rank_name: p.ranks?.name ?? null,
          department: p.departments?.name ?? null,
          unit: p.unit ?? null,
          role: p.user_roles?.[0]?.role ?? null,
        })) as StaffOption[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff.slice(0, 100);
    return staff
      .filter((o) =>
        `${o.first_name} ${o.last_name} ${o.staff_id ?? ""} ${o.rank_abbrev ?? ""} ${o.rank_name ?? ""} ${o.department ?? ""} ${o.unit ?? ""} ${o.role ?? ""}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 100);
  }, [staff, search]);

  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={(o) => canEdit && setOpen(o)}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" disabled={!canEdit} className="flex-1 justify-start font-normal min-w-0">
            {icon ?? <UserCheck className="h-4 w-4 mr-2 text-primary shrink-0" />}
            <span className="truncate">{label || (canEdit ? placeholder : "Not authorised")}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" /> {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Search name, staff ID, rank, department or unit…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={() => { onChange(null, null); setOpen(false); }}
              >
                <X className="h-4 w-4 mr-2" /> Clear current selection
              </Button>
            )}
            <div role="listbox" aria-label={title} className="max-h-[320px] overflow-y-auto border rounded-md divide-y">
              {isLoading ? (
                <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading staff directory…
                </div>
              ) : isError ? (
                <div className="p-4 text-sm text-destructive text-center" role="status">
                  Staff directory could not be loaded. Please try again.
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center" role="status">No matching staff.</div>
              ) : filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${o.id === value ? "bg-accent" : ""}`}
                  onClick={() => { onChange(o.id, staffDisplay(o)); setOpen(false); }}
                >
                  <div className="font-medium flex items-center gap-2">
                    {staffDisplay(o)}
                    {o.staff_id && <span className="text-xs font-mono text-muted-foreground">{o.staff_id}</span>}
                    {o.status && o.status !== "active" && (
                      <Badge variant="outline" className="text-[10px] capitalize">{o.status.replace(/_/g, " ")}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[o.rank_name || o.rank_abbrev, roleLabel(o.role), o.department, o.unit].filter(Boolean).join(" · ") || "—"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {canEdit && value && (
        <Button type="button" variant="outline" size="icon" title="Clear selection" onClick={() => onChange(null, null)}>
          <X className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}
