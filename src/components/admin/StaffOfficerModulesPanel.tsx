import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MODULES } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

/**
 * Super Admin only: tick the modules each Staff Officer may open.
 * Staff Officers see only their own command's data (enforced in the database)
 * and only the restricted modules ticked here.
 */
export function StaffOfficerModulesPanel() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [officer, setOfficer] = useState<string>("");
  const [q, setQ] = useState("");

  const { data: officers = [] } = useQuery({
    queryKey: ["staff-officers-list"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "staff_officer");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("user_id, first_name, last_name, staff_id").in("user_id", ids);
      return data ?? [];
    },
  });

  const { data: grants = [], isLoading } = useQuery({
    queryKey: ["staff-officer-grants", officer],
    enabled: isAdmin && !!officer,
    queryFn: async () => {
      const { data, error } = await supabase.from("command_tier_grants")
        .select("id, capability").eq("user_id", officer).is("revoked_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const restricted = useMemo(
    () => MODULES.filter((m) => m.roles !== "all" && m.tier !== "admin")
      .filter((m) => !q || m.label.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  const granted = new Set(grants.map((g) => g.capability));

  const toggle = useMutation({
    mutationFn: async ({ key, on }: { key: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from("command_tier_grants").insert({
          user_id: officer, capability: key, granted_by: user!.id,
          granted_by_name: user?.email ?? null, reason: "Staff Officer module assignment",
        });
        if (error) throw error;
      } else {
        const ids = grants.filter((g) => g.capability === key).map((g) => g.id);
        const { error } = await supabase.from("command_tier_grants")
          .update({ revoked_at: new Date().toISOString(), revoked_by: user!.id } as any).in("id", ids);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-officer-grants", officer] }); qc.invalidateQueries({ queryKey: ["rbac"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Staff Officer module access</CardTitle>
        <CardDescription>Staff Officers only see their own command. Tick the extra modules each one may open.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Staff Officer</Label>
            <Select value={officer} onValueChange={setOfficer}>
              <SelectTrigger><SelectValue placeholder="Choose a Staff Officer" /></SelectTrigger>
              <SelectContent>
                {officers.map((o: any) => (
                  <SelectItem key={o.user_id} value={o.user_id}>{o.staff_id} — {o.last_name}, {o.first_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Find module</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
          </div>
        </div>
        {officer && (isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-96 overflow-y-auto rounded border p-3">
            {restricted.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={granted.has(m.key)} disabled={toggle.isPending}
                  onCheckedChange={(v) => toggle.mutate({ key: m.key, on: !!v })} />
                {m.label}
              </label>
            ))}
          </div>
        ))}
        {officer && (
          <Button variant="outline" size="sm" onClick={() => restricted.filter((m) => granted.has(m.key)).forEach((m) => toggle.mutate({ key: m.key, on: false }))}>
            Remove all modules
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
