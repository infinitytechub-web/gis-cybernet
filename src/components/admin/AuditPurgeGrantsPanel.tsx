import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Grant = { user_id: string; name: string; staff_id: string | null; granted_at: string };

/** Super Admin screen: choose which administrators may purge old audit entries. */
export function AuditPurgeGrantsPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const grants = useQuery({
    queryKey: ["audit-purge-grants"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_audit_purge_grants");
      if (error) throw error;
      return (data ?? []) as Grant[];
    },
  });

  // Candidates: holders of the admin role (the server still decides).
  const candidates = useQuery({
    queryKey: ["audit-purge-candidates"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, staff_id")
        .in("user_id", ids);
      return (data ?? []) as Array<{ user_id: string; first_name: string | null; last_name: string | null; staff_id: string | null }>;
    },
  });

  const set = async (userId: string, grant: boolean) => {
    setBusy(userId);
    const { error } = await (supabase.rpc as any)("set_audit_purge_grant", { _user_id: userId, _grant: grant });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(grant ? "Purge access granted" : "Purge access removed");
    qc.invalidateQueries({ queryKey: ["audit-purge-grants"] });
    qc.invalidateQueries({ queryKey: ["can-purge-audit"] });
  };

  const granted = new Set((grants.data ?? []).map((g) => g.user_id));
  const q = search.trim().toLowerCase();
  const available = (candidates.data ?? [])
    .filter((c) => !granted.has(c.user_id))
    .filter((c) => !q || `${c.last_name ?? ""} ${c.first_name ?? ""} ${c.staff_id ?? ""}`.toLowerCase().includes(q))
    .slice(0, 25);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-destructive" /> Audit purge access</CardTitle>
        <CardDescription>Super Admins can always purge. Grant or remove purge access for selected administrators. Every change is recorded.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Granted ({grants.data?.length ?? 0})</h3>
          {grants.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
            grants.error ? <p className="text-sm text-destructive">{(grants.error as Error).message}</p> :
            !grants.data?.length ? <p className="text-sm text-muted-foreground">No administrators granted yet.</p> :
            <ul className="divide-y rounded-md border">
              {grants.data.map((g) => (
                <li key={g.user_id} className="flex items-center justify-between gap-2 p-2 text-sm">
                  <span className="min-w-0 truncate">{g.name || "Unnamed"} <span className="text-muted-foreground">{g.staff_id}</span></span>
                  <Button size="sm" variant="outline" disabled={busy === g.user_id} onClick={() => set(g.user_id, false)}>Remove</Button>
                </li>
              ))}
            </ul>}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Add administrator</h3>
          <Input placeholder="Search name or staff ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search administrators" />
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {available.length === 0 && <li className="p-2 text-sm text-muted-foreground">No matching administrators.</li>}
            {available.map((c) => (
              <li key={c.user_id} className="flex items-center justify-between gap-2 p-2 text-sm">
                <span className="min-w-0 truncate">{`${c.last_name ?? ""} ${c.first_name ?? ""}`.trim() || "Unnamed"} <span className="text-muted-foreground">{c.staff_id}</span></span>
                <Button size="sm" className="gap-1" disabled={busy === c.user_id} onClick={() => set(c.user_id, true)}><UserPlus className="h-4 w-4" /> Grant</Button>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
