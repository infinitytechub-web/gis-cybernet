import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, Database, Activity, UserPlus, Grid3X3, Settings2, KeyRound, Search, ShieldAlert, Trash2, History, Link2, Network, Layers, DatabaseBackup, MailCheck, Fingerprint, Unlock, ShieldCheck, Briefcase, Palette, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { BulkCreateAccounts } from "@/components/settings/BulkCreateAccounts";
import { PermissionsMatrix } from "@/components/settings/PermissionsMatrix";
import { AccessPolicySettings } from "@/components/settings/AccessPolicySettings";
import { AnonymizationSettings } from "@/components/settings/AnonymizationSettings";

import { AppSettings } from "@/components/settings/AppSettings";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { FailedLoginAttemptsPanel } from "@/components/settings/FailedLoginAttemptsPanel";
import { FailedLoginTimelinePanel } from "@/components/settings/FailedLoginTimelinePanel";
import { PresenceEventsPanel } from "@/components/settings/PresenceEventsPanel";
import { ShiftConnectionsAuditPanel } from "@/components/settings/ShiftConnectionsAuditPanel";
import { ShiftConnectionPermissionsMatrix } from "@/components/settings/ShiftConnectionPermissionsMatrix";
import TwoFactorSetup from "@/components/auth/TwoFactorSetup";
import { InterlinkBrandingSettings } from "@/components/interlink/InterlinkBrandingSettings";
import { ShiftRotationSettings } from "@/components/settings/ShiftRotationSettings";
import { ShiftRotationOverrides } from "@/components/settings/ShiftRotationOverrides";
import { SystemBackup } from "@/components/settings/SystemBackup";
import { EmailDeliveryTest } from "@/components/settings/EmailDeliveryTest";
import { LockedAccountsPanel } from "@/components/settings/LockedAccountsPanel";
import { FirewallSettingsPanel } from "@/components/settings/FirewallSettingsPanel";
import { FirewallAlertSettings } from "@/components/settings/FirewallAlertSettings";
import { SecurityAuditPanel } from "@/components/settings/SecurityAuditPanel";
import { HrmExportDlpPanel } from "@/components/settings/HrmExportDlpPanel";
import { MfaRecoveryPanel } from "@/components/settings/MfaRecoveryPanel";
import { SecurityUpdatesPanel } from "@/components/settings/SecurityUpdatesPanel";
import { PortfoliosTab } from "@/components/settings/PortfoliosTab";
import { BiometricAdminPanel } from "@/components/security/BiometricAdminPanel";
import { BiometricEnrollmentPolicyCard } from "@/components/security/BiometricEnrollmentPolicyCard";
import { BiometricAuditLogCard } from "@/components/security/BiometricAuditLogCard";
import { BiometricReminderCard } from "@/components/security/BiometricReminderCard";


import { toast } from "sonner";
import { Navigate, useSearchParams } from "react-router-dom";
import type { AppRole } from "@/lib/types";

const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  oic: "Command OIC",
  "2ic": "2IC",
  head_of_administration: "Head of Administration",
  chief_staff_officer: "Chief Staff Officer",
  command_officer: "Command Officer",
  me_officer: "M&E Officer",
  project_manager: "Project Manager",
  field_officer: "Field Officer",
  head_of_processing: "Head of Processing",
  deputy_head_of_processing: "Dep. Head of Processing",
  staff_officer: "Staff Officer",
  supervisor: "Supervisor",
  ipse_supervisor: "IPSE Supervisor",
  ipse_deputy_supervisor: "IPSE Deputy Supervisor",
  shift_leader: "Shift Leader",
  deputy_supervisor: "Dep. Supervisor",
  deputy_shift_leader: "Dep. Shift Leader",
  special_duties: "Special Duties",
  deputy: "Deputy",
  staff: "Staff",
  front_desk: "Front Desk",
  official: "Official",
  enquiry: "Enquiry",
  shift_supervisor: "Shift Supervisor",
  deputy_shift_supervisor: "Dep. Shift Supervisor",
  storekeeper: "Storekeeper",
  procurement_officer: "Procurement Officer",
  medical_officer: "Medical Officer",
};

const roleColors: Record<AppRole, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  oic: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20",
  "2ic": "bg-teal-500/15 text-teal-700 border-teal-500/20",
  head_of_administration: "bg-cyan-500/15 text-cyan-700 border-cyan-500/20",
  chief_staff_officer: "bg-sky-500/15 text-sky-700 border-sky-500/20",
  command_officer: "bg-sky-500/15 text-sky-700 border-sky-500/20",
  me_officer: "bg-teal-500/15 text-teal-700 border-teal-500/20",
  project_manager: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  field_officer: "bg-cyan-500/15 text-cyan-700 border-cyan-500/20",
  head_of_processing: "bg-indigo-500/15 text-indigo-700 border-indigo-500/20",
  deputy_head_of_processing: "bg-violet-500/15 text-violet-700 border-violet-500/20",
  staff_officer: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  supervisor: "bg-primary/10 text-primary border-primary/20",
  ipse_supervisor: "bg-[hsl(82,40%,30%)]/15 text-[hsl(82,40%,30%)] border-[hsl(82,40%,30%)]/30 dark:text-[hsl(82,50%,65%)]",
  ipse_deputy_supervisor: "bg-[hsl(82,30%,40%)]/15 text-[hsl(82,30%,40%)] border-[hsl(82,30%,40%)]/30 dark:text-[hsl(82,40%,70%)]",
  shift_leader: "bg-chart-1/15 text-chart-1 border-chart-1/20",
  deputy_supervisor: "bg-chart-2/15 text-chart-2 border-chart-2/20",
  deputy_shift_leader: "bg-chart-3/15 text-chart-3 border-chart-3/20",
  special_duties: "bg-chart-4/15 text-chart-4 border-chart-4/20",
  deputy: "bg-chart-5/15 text-chart-5 border-chart-5/20",
  staff: "bg-muted text-muted-foreground border-border",
  front_desk: "bg-orange-100 text-orange-800 border-orange-200",
  official: "bg-cyan-500/15 text-cyan-700 border-cyan-500/20",
  enquiry: "bg-lime-500/15 text-lime-700 border-lime-500/20",
  shift_supervisor: "bg-indigo-500/15 text-indigo-700 border-indigo-500/20",
  deputy_shift_supervisor: "bg-violet-500/15 text-violet-700 border-violet-500/20",
  storekeeper: "bg-amber-500/15 text-amber-700 border-amber-500/20",
  procurement_officer: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20",
  medical_officer: "bg-rose-500/15 text-rose-700 border-rose-500/20",
};

/**
 * Settings tabs, grouped into two areas so the page is navigable:
 * "security" (identity, access, monitoring, logging) and "system"
 * (organization, configuration, integrations, maintenance).
 */
const TAB_DEFS: { value: string; label: string; icon: any; iconClass: string; area: "security" | "system" }[] = [
  { value: "roles", label: "User Roles", icon: Shield, iconClass: "text-destructive", area: "security" },
  { value: "permissions", label: "Permissions", icon: Grid3X3, iconClass: "text-chart-1", area: "security" },
  { value: "access-policy", label: "Access Policy", icon: ShieldCheck, iconClass: "text-chart-5", area: "security" },
  { value: "anonymization", label: "Anonymisation", icon: EyeOff, iconClass: "text-indigo-600", area: "security" },

  { value: "2fa", label: "2FA", icon: KeyRound, iconClass: "text-chart-5", area: "security" },
  { value: "biometrics", label: "Biometrics", icon: Fingerprint, iconClass: "text-primary", area: "security" },
  { value: "mfa-recovery", label: "MFA Recovery", icon: KeyRound, iconClass: "text-amber-600", area: "security" },
  { value: "lockouts", label: "Lockouts", icon: ShieldAlert, iconClass: "text-destructive", area: "security" },
  { value: "locked-accounts", label: "Locked Accounts", icon: Unlock, iconClass: "text-emerald-600", area: "security" },
  { value: "login-audit", label: "Login Audit", icon: History, iconClass: "text-destructive", area: "security" },
  { value: "presence", label: "Presence Log", icon: Activity, iconClass: "text-primary", area: "security" },
  { value: "firewall", label: "Firewall", icon: ShieldCheck, iconClass: "text-emerald-600", area: "security" },
  { value: "firewall-alerts", label: "Firewall Alerts", icon: ShieldAlert, iconClass: "text-amber-600", area: "security" },
  { value: "security-audit", label: "Security Audit", icon: History, iconClass: "text-emerald-600", area: "security" },
  { value: "security-updates", label: "Security Updates", icon: ShieldCheck, iconClass: "text-emerald-700", area: "security" },
  { value: "hrm-dlp", label: "HRM Export DLP", icon: ShieldCheck, iconClass: "text-emerald-700", area: "security" },
  { value: "recycle", label: "Recycle Bin", icon: Trash2, iconClass: "text-destructive", area: "security" },

  { value: "system", label: "System Info", icon: Database, iconClass: "text-primary", area: "system" },
  { value: "app-settings", label: "App Settings", icon: Settings2, iconClass: "text-chart-4", area: "system" },
  { value: "branding", label: "Branding", icon: Palette, iconClass: "text-chart-1", area: "system" },
  { value: "interlink-brand", label: "Interlink Branding", icon: Network, iconClass: "text-indigo-500", area: "system" },
  { value: "portfolios", label: "Portfolios", icon: Briefcase, iconClass: "text-primary", area: "system" },
  { value: "accounts", label: "Accounts", icon: UserPlus, iconClass: "text-chart-2", area: "system" },
  { value: "rotation", label: "Shift Rotation", icon: Layers, iconClass: "text-primary", area: "system" },
  { value: "shift-connections", label: "Shift Connections", icon: Link2, iconClass: "text-chart-3", area: "system" },
  { value: "shift-conn-perms", label: "Shift Conn. Perms", icon: KeyRound, iconClass: "text-primary", area: "system" },
  { value: "email-test", label: "Email Test", icon: MailCheck, iconClass: "text-primary", area: "system" },
  { value: "backup", label: "System Backup", icon: DatabaseBackup, iconClass: "text-primary", area: "system" },
];

export default function Settings() {
  const { isAdmin, loading: authLoading } = useAuth();

  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const areaParam = searchParams.get("area") === "system" ? "system" : searchParams.get("area") === "security" ? "security" : null;

  // Show only the requested area's tabs; without an area, show everything.
  const visibleTabs = TAB_DEFS.filter(
    (t) => !areaParam || t.area === areaParam || t.value === tabParam,
  );
  const initialTab = tabParam && visibleTabs.some((t) => t.value === tabParam)
    ? tabParam
    : visibleTabs[0]?.value ?? "roles";

  if (!authLoading && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const heading = areaParam === "security" ? "Security Settings" : areaParam === "system" ? "System Settings" : "Settings";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">{heading}</h1>
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          {visibleTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
              <t.icon className={`h-4 w-4 ${t.iconClass}`} /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>


        <TabsContent value="roles"><UserRolesTab /></TabsContent>
        <TabsContent value="permissions"><PermissionsMatrix /></TabsContent>
        <TabsContent value="access-policy"><AccessPolicySettings /></TabsContent>
        <TabsContent value="anonymization"><AnonymizationSettings /></TabsContent>

        <TabsContent value="portfolios"><PortfoliosTab /></TabsContent>
        <TabsContent value="accounts"><BulkCreateAccounts /></TabsContent>
        <TabsContent value="app-settings"><AppSettings /></TabsContent>
        <TabsContent value="branding"><BrandingSettings /></TabsContent>
        <TabsContent value="lockouts"><FailedLoginAttemptsPanel /></TabsContent>
        <TabsContent value="locked-accounts"><LockedAccountsPanel /></TabsContent>
        <TabsContent value="login-audit"><FailedLoginTimelinePanel /></TabsContent>
        <TabsContent value="presence"><PresenceEventsPanel /></TabsContent>
        <TabsContent value="shift-connections"><ShiftConnectionsAuditPanel /></TabsContent>
        <TabsContent value="shift-conn-perms"><ShiftConnectionPermissionsMatrix /></TabsContent>
        <TabsContent value="recycle">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-destructive" /> Recycle Bin</CardTitle>
              <CardDescription>Restore mistakenly deleted items, or empty the bin permanently. Items auto-purge after 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/recycle-bin" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                Open the Recycle Bin →
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="system"><SystemInfoTab /></TabsContent>
        <TabsContent value="2fa"><TwoFactorSetup /></TabsContent>
        <TabsContent value="biometrics" className="space-y-4">
          <BiometricEnrollmentPolicyCard />
          <BiometricReminderCard />
          <BiometricAdminPanel />
          <BiometricAuditLogCard />


        </TabsContent>
        <TabsContent value="interlink-brand"><InterlinkBrandingSettings /></TabsContent>
        <TabsContent value="rotation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Flexible Shift Rotation Calendar</CardTitle>
              <CardDescription>
                The new admin workspace lets you build versioned, scope-aware rotation schedules and
                publish them organisation-wide.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                to="/admin/shift-rotations"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                Open Shift Rotations workspace →
              </Link>
            </CardContent>
          </Card>
          <ShiftRotationSettings />
          <ShiftRotationOverrides />
        </TabsContent>
        <TabsContent value="backup"><SystemBackup /></TabsContent>
        <TabsContent value="email-test"><EmailDeliveryTest /></TabsContent>
        <TabsContent value="firewall"><FirewallSettingsPanel /></TabsContent>
        <TabsContent value="firewall-alerts"><FirewallAlertSettings /></TabsContent>
        <TabsContent value="security-audit"><SecurityAuditPanel /></TabsContent>
        <TabsContent value="hrm-dlp"><HrmExportDlpPanel /></TabsContent>
        <TabsContent value="mfa-recovery"><MfaRecoveryPanel /></TabsContent>
        <TabsContent value="security-updates"><SecurityUpdatesPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── User Roles Management ─── */
function UserRolesTab() {
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: usersWithRoles = [], isLoading } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, user_id, account_locked, login_enabled")
        .not("user_id", "is", null)
        .order("last_name");
      if (pErr) throw pErr;

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

  const toggleProfileField = useMutation({
    mutationFn: async ({ profileId, field, value }: { profileId: string; field: "account_locked" | "login_enabled"; value: boolean }) => {
      const updateData = field === "account_locked" ? { account_locked: value } : { login_enabled: value };
      const { error } = await supabase.from("profiles").update(updateData).eq("id", profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("Updated successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return usersWithRoles;
    const q = search.toLowerCase();
    return usersWithRoles.filter((u) =>
      u.staff_id?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q) ||
      roleLabels[u.role]?.toLowerCase().includes(q)
    );
  }, [usersWithRoles, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Manage User Roles</CardTitle>
        <CardDescription>Assign roles and control account access for users with linked accounts.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, staff ID, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading users...</div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead className="w-[180px]">Change Role</TableHead>
                  <TableHead className="text-center w-[90px]">Login</TableHead>
                  <TableHead className="text-center w-[90px]">Locked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.staff_id}</TableCell>
                    <TableCell className="font-medium">{u.last_name}, {u.first_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleColors[u.role]}>
                        {roleLabels[u.role]}
                      </Badge>
                    </TableCell>
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
                          {(Object.keys(roleLabels) as AppRole[]).map((r) => (
                            <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={u.login_enabled}
                        onCheckedChange={(val) => {
                          toggleProfileField.mutate({ profileId: u.id, field: "login_enabled", value: val });
                          if (val && u.account_locked) {
                            toggleProfileField.mutate({ profileId: u.id, field: "account_locked", value: false });
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={u.account_locked}
                        onCheckedChange={(val) => {
                          toggleProfileField.mutate({ profileId: u.id, field: "account_locked", value: val });
                          if (val && u.login_enabled) {
                            toggleProfileField.mutate({ profileId: u.id, field: "login_enabled", value: false });
                          }
                        }}
                        className={u.account_locked ? "data-[state=checked]:bg-destructive" : ""}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {search ? "No users match your search." : "No linked user accounts found."}
                    </TableCell>
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
    { label: "Total Staff Profiles", value: counts?.profiles, color: "text-primary", bg: "bg-primary/10" },
    { label: "Departments", value: counts?.departments, color: "text-chart-1", bg: "bg-chart-1/10" },
    { label: "Ranks / Designations", value: counts?.ranks, color: "text-chart-2", bg: "bg-chart-2/10" },
    { label: "Shifts Configured", value: counts?.shifts, color: "text-chart-4", bg: "bg-chart-4/10" },
    { label: "Leave Requests (All Time)", value: counts?.leaves, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Postings / Transfers (All Time)", value: counts?.postings, color: "text-chart-5", bg: "bg-chart-5/10" },
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
              <div key={item.label} className={`rounded-lg border p-4 text-center ${item.bg}`}>
                <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
