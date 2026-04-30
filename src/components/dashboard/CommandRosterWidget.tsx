import { useQuery } from "@tanstack/react-query";
import { Crown, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, COMMAND_TIER_ROLES, roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";

type Holder = { user_id: string; role: AppRole; first_name?: string | null; last_name?: string | null; email?: string | null };

export default function CommandRosterWidget() {
  const { data: holders = [] } = useQuery({
    queryKey: ["command-roster"],
    queryFn: async () => {
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", COMMAND_TIER_ROLES as any);
      if (error) throw error;
      const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (roleRows ?? []).map((r: any) => {
        const p: any = byId.get(r.user_id) ?? {};
        return { user_id: r.user_id, role: r.role, first_name: p.first_name, last_name: p.last_name, email: p.email } as Holder;
      });
    },
  });

  // Group holders by role, preserving the canonical command-tier order
  const grouped = COMMAND_TIER_ROLES.map((role) => ({
    role,
    label: ROLE_LABEL[role] ?? roleLabel(role),
    people: holders.filter((h) => h.role === role),
  }));

  const newRoles = new Set<AppRole>(["head_of_administration", "chief_staff_officer"]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-600" />
          Command Roster
        </CardTitle>
        <CardDescription className="text-xs">
          Current holders of every command-tier role
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {grouped.map(({ role, label, people }) => (
            <div
              key={role}
              className={`rounded-lg border p-3 ${
                newRoles.has(role)
                  ? "border-emerald-400/60 bg-emerald-50/60 dark:bg-emerald-950/20"
                  : "bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>{label}</span>
                </div>
                {newRoles.has(role) && (
                  <Badge className="text-[9px] bg-emerald-600 hover:bg-emerald-600">NEW</Badge>
                )}
              </div>
              {people.length === 0 ? (
                <p className="text-[11px] italic text-muted-foreground">Vacant</p>
              ) : (
                <ul className="space-y-1">
                  {people.map((p) => (
                    <li key={p.user_id} className="text-xs">
                      <span className="font-medium">
                        {p.first_name || p.last_name ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : p.email ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
