import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { Crown, ShieldCheck, ChevronDown, UserCog } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL, COMMAND_TIER_ROLES, roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";

// Admin-only quick role switcher in the top nav.
// Shows the admin's own role plus the current holder of every command-tier role,
// with a one-click jump to the full management page.
export function HeaderRoleSwitcher() {
  const { isAdmin, role } = useAuth();

  const { data: holders = {} } = useQuery({
    queryKey: ["header-role-switcher-holders"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", COMMAND_TIER_ROLES as any);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids)
        : { data: [] as any[] };
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const map: Partial<Record<AppRole, string[]>> = {};
      for (const r of roles ?? []) {
        const p: any = byId.get(r.user_id) ?? {};
        const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "—";
        const arr = map[r.role as AppRole] ?? [];
        arr.push(name);
        map[r.role as AppRole] = arr;
      }
      return map;
    },
  });

  if (!isAdmin) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 hidden md:inline-flex">
          <Crown className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs">{roleLabel(role)}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs">Command-tier roles</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[320px] overflow-y-auto">
          {COMMAND_TIER_ROLES.map((r) => {
            const names = holders[r] ?? [];
            const isNew = r === "head_of_administration" || r === "chief_staff_officer";
            return (
              <div key={r} className="px-2 py-1.5">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <ShieldCheck className="h-3 w-3 text-primary" />
                    {ROLE_LABEL[r] ?? roleLabel(r)}
                  </div>
                  {isNew && <Badge className="text-[8px] h-3.5 bg-emerald-600 hover:bg-emerald-600">NEW</Badge>}
                </div>
                <div className="text-[10px] text-muted-foreground pl-4 truncate">
                  {names.length === 0 ? <span className="italic">Vacant</span> : names.join(", ")}
                </div>
              </div>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <NavLink to="/command-roles" className="cursor-pointer text-xs gap-1.5">
            <UserCog className="h-3.5 w-3.5" /> Manage command roles
          </NavLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
