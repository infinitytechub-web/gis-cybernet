import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Search, ShieldCheck, X } from "lucide-react";
import { roleLabel } from "@/lib/role-labels";

interface Props {
  /** profiles.id of the approving officer */
  value: string | null;
  /** Display snapshot stored alongside the id */
  label: string | null;
  onChange: (id: string | null, label: string | null) => void;
  /** When false the field is read-only (RBAC: only command tier may approve) */
  canEdit?: boolean;
}

type ApproverOption = {
  id: string;
  first_name: string;
  last_name: string;
  rank_abbrev: string | null;
  rank_name: string | null;
  department: string | null;
  unit: string | null;
  role: string | null;
};

export function approverDisplay(o: ApproverOption) {
  const rank = o.rank_abbrev || o.rank_name || "";
  return `${rank ? rank + " " : ""}${o.first_name} ${o.last_name}`.trim();
}

/**
 * Searchable pick-and-select field for "Statement Approved by".
 *
 * Lists established personnel (command hierarchy, departments/units and other
 * authorised staff) with Full Name, Rank/Position and Department/Unit. The list
 * itself is served through the `profiles` table, so RLS keeps restricted
 * directory information out of reach of unauthorised users. Selection is only
 * enabled for command tier (enforced again by a database trigger).
 */
export function StatementApproverPicker({ value, label, onChange, canEdit = true }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["detention-approver-options"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, unit, ranks(abbreviation, name), departments(name), user_roles(role)")
        .order("last_name")
        .limit(1000);
      if (error) throw error;
      return ((data ?? []) as any[]).map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        rank_abbrev: p.ranks?.abbreviation ?? null,
        rank_name: p.ranks?.name ?? null,
        department: p.departments?.name ?? null,
        unit: p.unit ?? null,
        role: p.user_roles?.[0]?.role ?? null,
      })) as ApproverOption[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff.slice(0, 100);
    return staff
      .filter((o) =>
        `${o.first_name} ${o.last_name} ${o.rank_abbrev ?? ""} ${o.rank_name ?? ""} ${o.department ?? ""} ${o.unit ?? ""} ${o.role ?? ""}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 100);
  }, [staff, search]);

  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={(o) => canEdit && setOpen(o)}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" disabled={!canEdit} className="flex-1 justify-start font-normal">
            <ShieldCheck className="h-4 w-4 mr-2 text-primary shrink-0" />
            <span className="truncate">{label || (canEdit ? "Select approving officer…" : "Not authorised")}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Statement Approved by
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Search name, rank, department or unit…"
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
                <X className="h-4 w-4 mr-2" /> Clear current approver
              </Button>
            )}
            <div role="listbox" aria-label="Approving officers" className="max-h-[320px] overflow-y-auto border rounded-md divide-y">
              {isLoading ? (
                <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading personnel…
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center" role="status">No matching personnel.</div>
              ) : filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${o.id === value ? "bg-accent" : ""}`}
                  onClick={() => { onChange(o.id, approverDisplay(o)); setOpen(false); }}
                >
                  <div className="font-medium">{approverDisplay(o)}</div>
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
        <Button type="button" variant="outline" size="icon" title="Clear approver" onClick={() => onChange(null, null)}>
          <X className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}
