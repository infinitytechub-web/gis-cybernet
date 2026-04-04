import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, Database, Activity, UserPlus } from "lucide-react";
import { BulkCreateAccounts } from "@/components/settings/BulkCreateAccounts";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import type { AppRole } from "@/lib/types";

export default function Settings() {
  const { isAdmin, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Redirect non-admins
  if (!authLoading && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">System Settings</h1>
      <Tabs defaultValue="roles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="roles" className="gap-1.5"><Shield className="h-4 w-4" /> User Roles</TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5"><UserPlus className="h-4 w-4" /> Accounts</TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5"><Database className="h-4 w-4" /> System Info</TabsTrigger>
        </TabsList>

        <TabsContent value="roles"><UserRolesTab /></TabsContent>
        <TabsContent value="accounts"><BulkCreateAccounts /></TabsContent>
        <TabsContent value="system"><SystemInfoTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── User Roles Management ─── */
function UserRolesTab() {
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: usersWithRoles = [], isLoading } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      // Get all profiles with user_id (linked accounts)
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, user_id")
        .not("user_id", "is", null)
        .order("last_name");
      if (pErr) throw pErr;

      // Get all user roles
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const roleMap = new Map<string, AppRole>();
      roles?.forEach((r) => roleMap.set(r.user_id, r.role as AppRole));

      return (profiles ?? []).map((p) => ({
        ...p,
        role: roleMap.get(p.user_id!) ?? ("staff" as AppRole),
      }));
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      // Upsert: delete existing then insert
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("Role updated");
      setUpdatingId(null);
    },
    onError: (e: any) => {
      toast.error(e.message);
      setUpdatingId(null);
    },
  });

  const roleBadge = (role: AppRole) => {
    const colors: Record<AppRole, string> = {
      admin: "bg-destructive/10 text-destructive border-destructive/20",
      supervisor: "bg-primary/10 text-primary border-primary/20",
      deputy_supervisor: "bg-primary/10 text-primary border-primary/20",
      shift_leader: "bg-accent text-accent-foreground border-border",
      deputy_shift_leader: "bg-accent text-accent-foreground border-border",
      deputy: "bg-accent text-accent-foreground border-border",
      staff: "bg-muted text-muted-foreground border-border",
    };
    return <Badge variant="outline" className={colors[role]}>{role}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Manage User Roles</CardTitle>
        <CardDescription>Assign admin, supervisor, or staff roles to users with linked accounts.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading users...</div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead className="w-[180px]">Change Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersWithRoles.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.staff_id}</TableCell>
                    <TableCell className="font-medium">{u.last_name}, {u.first_name}</TableCell>
                    <TableCell>{roleBadge(u.role)}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(val) => {
                          setUpdatingId(u.user_id!);
                          updateRoleMutation.mutate({ userId: u.user_id!, newRole: val as AppRole });
                        }}
                        disabled={updatingId === u.user_id}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="deputy">Deputy</SelectItem>
                          <SelectItem value="deputy_shift_leader">Deputy Shift Leader</SelectItem>
                          <SelectItem value="shift_leader">Shift Leader</SelectItem>
                          <SelectItem value="deputy_supervisor">Deputy Supervisor</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
                {usersWithRoles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No linked user accounts found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── System Info ─── */
function SystemInfoTab() {
  const { data: counts, isLoading } = useQuery({
    queryKey: ["system-counts"],
    queryFn: async () => {
      const [profiles, departments, ranks, shifts, leaves, postings] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("departments").select("id", { count: "exact", head: true }),
        supabase.from("ranks").select("id", { count: "exact", head: true }),
        supabase.from("shifts").select("id", { count: "exact", head: true }),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }),
        supabase.from("postings_transfers").select("id", { count: "exact", head: true }),
      ]);
      return {
        profiles: profiles.count ?? 0,
        departments: departments.count ?? 0,
        ranks: ranks.count ?? 0,
        shifts: shifts.count ?? 0,
        leaves: leaves.count ?? 0,
        postings: postings.count ?? 0,
      };
    },
  });

  const items = [
    { label: "Total Staff Profiles", value: counts?.profiles },
    { label: "Departments", value: counts?.departments },
    { label: "Ranks / Designations", value: counts?.ranks },
    { label: "Shifts Configured", value: counts?.shifts },
    { label: "Leave Requests (All Time)", value: counts?.leaves },
    { label: "Postings / Transfers (All Time)", value: counts?.postings },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> System Overview</CardTitle>
        <CardDescription>Summary of data across the HRM system.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {items.map((item) => (
              <div key={item.label} className="rounded-lg border p-4 text-center">
                <div className="text-2xl font-bold text-primary">{item.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
