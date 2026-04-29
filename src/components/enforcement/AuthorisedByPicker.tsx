import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, ShieldCheck, X } from "lucide-react";

interface Props {
  value: string | null;          // profile.id
  onChange: (id: string | null, label: string | null) => void;
}

type AuthProfile = {
  id: string;
  first_name: string;
  last_name: string;
  ranks: { abbreviation: string } | null;
  departments: { name: string } | null;
  role: string;
};

/**
 * Picker for the OIC or 2IC who authorised a record. Lists only profiles
 * whose linked user holds the `oic` or `2ic` role.
 */
export function AuthorisedByPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: officers = [] } = useQuery({
    queryKey: ["authorising-officers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, user_id, profiles!inner(id, first_name, last_name, ranks(abbreviation), departments(name))")
        .in("role", ["oic", "2ic"]);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.profiles.id,
        first_name: r.profiles.first_name,
        last_name: r.profiles.last_name,
        ranks: r.profiles.ranks,
        departments: r.profiles.departments,
        role: r.role,
      })) as AuthProfile[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return officers;
    return officers.filter((o) => {
      const blob = `${o.first_name} ${o.last_name} ${o.ranks?.abbreviation ?? ""} ${o.departments?.name ?? ""} ${o.role}`.toLowerCase();
      return blob.includes(q);
    });
  }, [officers, search]);

  const selected = officers.find((o) => o.id === value);
  const selectedLabel = selected
    ? `${selected.ranks?.abbreviation ? selected.ranks.abbreviation + " " : ""}${selected.first_name} ${selected.last_name} (${selected.role.toUpperCase()})`
    : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start">
          <ShieldCheck className="h-4 w-4 mr-2 text-primary" />
          {selected ? selectedLabel : "Select OIC / 2IC..."}
          {selected && (
            <X
              className="h-4 w-4 ml-auto text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(null, null); }}
            />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Authorised By (OIC / 2IC)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, rank or department..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" autoFocus />
          </div>
          <div className="max-h-[320px] overflow-y-auto border rounded-md divide-y">
            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">No matching OIC / 2IC found.</div>
            ) : filtered.map((o) => {
              const label = `${o.ranks?.abbreviation ? o.ranks.abbreviation + " " : ""}${o.first_name} ${o.last_name}`;
              return (
                <button
                  key={o.id + o.role}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
                  onClick={() => { onChange(o.id, label); setOpen(false); }}
                >
                  <span>{label}<span className="text-xs text-muted-foreground"> — {o.departments?.name ?? "—"}</span></span>
                  <span className="text-[10px] uppercase font-mono text-primary">{o.role}</span>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
