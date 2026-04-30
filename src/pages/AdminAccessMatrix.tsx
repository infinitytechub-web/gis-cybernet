import { Crown, ShieldAlert, Lock, Check, X, Printer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ROLE_LABEL, COMMAND_TIER_ROLES, roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";

/**
 * Admin Sections Access Matrix
 * Source-of-truth view for which roles can reach each /admin-class route.
 * Mirrors the sidebar gating in src/components/AppSidebar.tsx.
 */

type Access = "yes" | "view" | "no";

type AdminSection = {
  path: string;
  name: string;
  description: string;
  access: Partial<Record<AppRole, Access>>;
};

const ROLES_DISPLAYED: AppRole[] = [
  "admin",
  "oic",
  "2ic",
  "head_of_administration",
  "chief_staff_officer",
  "staff_officer",
  "supervisor",
  "shift_supervisor",
  "shift_leader",
  "front_desk",
  "staff",
];

// Defaults: command tier (admin/oic/2ic/HoA/CSO/staff_officer/supervisor) reads admin areas;
// only `admin` can write/manage. Mirrors live RLS + sidebar gating.
const sections: AdminSection[] = [
  {
    path: "/command-roles",
    name: "Command Roles",
    description: "Assign or change command-tier role holders, view audit trail.",
    access: { admin: "yes" },
  },
  {
    path: "/settings",
    name: "Settings",
    description: "System settings, permissions matrix, audit log, secrets.",
    access: { admin: "yes", oic: "view", "2ic": "view", head_of_administration: "view", chief_staff_officer: "view" },
  },
  {
    path: "/staff",
    name: "Staff Directory (Manage)",
    description: "Create / edit / lock staff accounts.",
    access: { admin: "yes", oic: "yes", "2ic": "yes", head_of_administration: "yes", chief_staff_officer: "yes", staff_officer: "yes", supervisor: "view", shift_supervisor: "view", shift_leader: "view", front_desk: "view", staff: "view" },
  },
  {
    path: "/admin-settings",
    name: "Admin Settings",
    description: "Print permission matrix, system-wide flags.",
    access: { admin: "yes", oic: "view", "2ic": "view", head_of_administration: "view", chief_staff_officer: "view" },
  },
  {
    path: "/audit-trail",
    name: "System Audit Trail",
    description: "Full immutable audit of writes across the system.",
    access: { admin: "yes", oic: "view", "2ic": "view", head_of_administration: "view", chief_staff_officer: "view" },
  },
  {
    path: "/interlink",
    name: "Interlink System",
    description: "Distribution lists, schedules, dispatch approvals.",
    access: { admin: "yes", oic: "yes", "2ic": "yes", head_of_administration: "yes", chief_staff_officer: "yes", staff_officer: "view", supervisor: "view" },
  },
  {
    path: "/processing",
    name: "Processing & Approvals",
    description: "Front-desk approvals queue, sensitive case data.",
    access: { admin: "yes", oic: "yes", "2ic": "yes", head_of_administration: "yes", chief_staff_officer: "yes", staff_officer: "yes", supervisor: "yes", shift_supervisor: "view", shift_leader: "view", front_desk: "view" },
  },
  {
    path: "/announcements",
    name: "Announcements (Author)",
    description: "Publish/edit organisation-wide announcements.",
    access: { admin: "yes", oic: "yes", "2ic": "yes", head_of_administration: "yes", chief_staff_officer: "yes", staff_officer: "view", supervisor: "view", shift_supervisor: "view", shift_leader: "view", front_desk: "view", staff: "view" },
  },
  {
    path: "/reports",
    name: "Reports",
    description: "Cross-department reports & dashboard exports.",
    access: { admin: "yes", oic: "yes", "2ic": "yes", head_of_administration: "yes", chief_staff_officer: "yes", staff_officer: "yes", supervisor: "view" },
  },
  {
    path: "/staff-onboarding",
    name: "Staff Onboarding (Bulk)",
    description: "Bulk-generate staff accounts; CSV/XLSX upload.",
    access: { admin: "yes", oic: "yes", "2ic": "yes", head_of_administration: "yes", chief_staff_officer: "yes" },
  },
];

const cell = (a?: Access) => {
  if (a === "yes") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]"><Check className="h-3 w-3 mr-1" />Manage</Badge>;
  if (a === "view") return <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px]">View</Badge>;
  return <Badge variant="outline" className="text-destructive/60 border-destructive/20 text-[10px]"><X className="h-3 w-3 mr-1" />No</Badge>;
};

export default function AdminAccessMatrix() {
  const { isAdminOrSupervisor } = useAuth();

  if (!isAdminOrSupervisor) {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Restricted</AlertTitle>
        <AlertDescription>Only command-tier staff may view the admin access matrix.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 admin-access-print-area">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Admin Sections — Access Matrix</h1>
            <p className="text-xs text-muted-foreground">
              Reference chart: which roles can reach each protected admin area. Source: sidebar gating + RLS policies.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 no-print" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
      </div>

      <Alert className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
        <Lock className="h-4 w-4" />
        <AlertTitle className="text-sm">Command-Roles is Admin-Only</AlertTitle>
        <AlertDescription className="text-xs">
          The <code className="text-[11px]">/command-roles</code> page is restricted exclusively to the <strong>Admin</strong> role.
          All other command-tier roles (OIC, 2IC, Head of Administration, Chief Staff Officer, Staff Officer, Supervisor) cannot
          assign or remove command-tier role holders.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-amber-600" /> Section access by role</CardTitle>
          <CardDescription className="text-xs">
            <strong>Manage</strong> = create/edit/delete · <strong>View</strong> = read-only · <strong>No</strong> = hidden / blocked by RLS
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto" style={{ minWidth: 700 }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Section</TableHead>
                  {ROLES_DISPLAYED.map((r) => (
                    <TableHead key={r} className="text-center text-[10px] min-w-[80px]">
                      {ROLE_LABEL[r] ?? roleLabel(r)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sections.map((s) => (
                  <TableRow key={s.path}>
                    <TableCell className="sticky left-0 bg-card z-10 align-top">
                      <div className="font-medium text-xs">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground">{s.path}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{s.description}</div>
                    </TableCell>
                    {ROLES_DISPLAYED.map((r) => (
                      <TableCell key={r} className="text-center">{cell(s.access[r])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Command-tier reference</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5 text-[11px]">
          {COMMAND_TIER_ROLES.map((r) => (
            <Badge key={r} variant="outline" className="border-emerald-500/40">
              {ROLE_LABEL[r] ?? roleLabel(r)}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
