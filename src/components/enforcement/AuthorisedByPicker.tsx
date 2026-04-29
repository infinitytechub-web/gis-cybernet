import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircle, Loader2, RefreshCw, Search, ShieldCheck, X } from "lucide-react";

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
 *
 * Server-side search (debounced) keeps the result-set small even as the
 * directory grows. A Clear button is always visible in edit mode so an
 * existing authoriser can be removed without re-opening the dialog.
 */
export function AuthorisedByPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce the search input (250ms) to avoid hammering the database
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Resolve the currently-selected officer label (independent of the search list)
  const { data: selected } = useQuery({
    queryKey: ["authorising-officer-selected", value],
    enabled: !!value,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, ranks(abbreviation), departments(name), user_roles(role)")
        .eq("id", value!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const role = (data as any).user_roles?.find((r: any) => r.role === "oic" || r.role === "2ic")?.role
        ?? (data as any).user_roles?.[0]?.role ?? "";
      return {
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        ranks: (data as any).ranks,
        departments: (data as any).departments,
        role,
      } as AuthProfile;
    },
  });

  // Server-side search against user_roles → profiles, scoped to OIC / 2IC
  const { data: officers = [], isFetching } = useQuery({
    queryKey: ["authorising-officers", debounced],
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from("user_roles")
        .select("role, user_id, profiles!inner(id, first_name, last_name, ranks(abbreviation), departments(name))")
        .in("role", ["oic", "2ic"])
        .limit(50);

      if (debounced) {
        const term = `%${debounced}%`;
        query = query.or(
          `first_name.ilike.${term},last_name.ilike.${term}`,
          { foreignTable: "profiles" },
        );
      }

      const { data, error } = await query;
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

  const selectedLabel = selected
    ? `${selected.ranks?.abbreviation ? selected.ranks.abbreviation + " " : ""}${selected.first_name} ${selected.last_name}${selected.role ? ` (${selected.role.toUpperCase()})` : ""}`
    : "";

  const isEditMode = !!value;

  // Keyboard navigation state for the results list
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setHighlight(0); }, [debounced, officers.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const commitSelection = (o: AuthProfile) => {
    const label = `${o.ranks?.abbreviation ? o.ranks.abbreviation + " " : ""}${o.first_name} ${o.last_name}`;
    onChange(o.id, label);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (officers.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % officers.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + officers.length) % officers.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = officers[highlight];
      if (target) commitSelection(target);
    }
    // Escape is handled natively by Radix Dialog
  };

  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="flex-1 justify-start">
            <ShieldCheck className="h-4 w-4 mr-2 text-primary" />
            {value ? (selectedLabel || "Loading...") : "Select OIC / 2IC..."}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md" onKeyDown={handleKeyDown}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Authorised By (OIC / 2IC)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by first or last name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9"
                autoFocus
                aria-activedescendant={officers[highlight] ? `auth-opt-${highlight}` : undefined}
                aria-controls="auth-results-list"
              />
              {isFetching && (
                <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
              )}
            </div>
            {isEditMode && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={() => { onChange(null, null); setOpen(false); }}
              >
                <X className="h-4 w-4 mr-2" /> Clear current authoriser
              </Button>
            )}
            <div
              id="auth-results-list"
              ref={listRef}
              role="listbox"
              className="max-h-[320px] overflow-y-auto border rounded-md divide-y"
            >
              {officers.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {isFetching ? "Searching..." : "No matching OIC / 2IC found."}
                </div>
              ) : officers.map((o, idx) => {
                const label = `${o.ranks?.abbreviation ? o.ranks.abbreviation + " " : ""}${o.first_name} ${o.last_name}`;
                const active = idx === highlight;
                return (
                  <button
                    key={o.id + o.role}
                    id={`auth-opt-${idx}`}
                    data-idx={idx}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${active ? "bg-accent" : "hover:bg-accent"}`}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => commitSelection(o)}
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

      {isEditMode && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Clear authoriser"
          onClick={() => onChange(null, null)}
        >
          <X className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}
