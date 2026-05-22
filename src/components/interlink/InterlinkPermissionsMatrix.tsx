import { Eye, ShieldCheck, Download, Upload, Check, X, KeyRound, Printer, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ROLE_LABEL, roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";

/**
 * Interlink Permissions Matrix
 * Source-of-truth view of which roles can View, Approve, Export, and Import
 * Interlink data. Mirrors the gating in src/pages/Interlink.tsx (isAdminOrSupervisor),
 * the approve-only `admin` check in ApprovalsTab, RLS policies on interlink_dispatches,
 * and the immutable hash-chained audit constraints.
 */

type Access = "yes" | "view" | "no";

type Action = {
  key: "view" | "approve" | "export" | "import";
  name: string;
  icon: typeof Eye;
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

// Command tier (admin/oic/2ic/HoA/CSO/staff_officer/supervisor) sees Interlink;
// only `admin` finalises approvals (sign-off on hash chain).
const actions: Action[] = [
  {
    key: "view",
    name: "View dispatches & audit",
    icon: Eye,
    description: "Open /interlink, read Compose drafts, schedules, rules, recipients, audit trail.",
    access: {
      admin: "yes", oic: "yes", "2ic": "yes",
      head_of_administration: "yes", chief_staff_officer: "yes",
      staff_officer: "view", supervisor: "view",
    },
  },
  {
    key: "approve",
    name: "Approve / sign-off",
    icon: ShieldCheck,
    description: "Approve drafts and write to the immutable hash-chained audit log.",
    access: {
      admin: "yes", oic: "yes", "2ic": "yes",
      head_of_administration: "yes", chief_staff_officer: "yes",
      staff_officer: "view", supervisor: "view",
    },
  },
  {
    key: "export",
    name: "Export (xlsx / csv / pdf)",
    icon: Download,
    description: "Download dispatch & audit data via interlink-export.ts.",
    access: {
      admin: "yes", oic: "yes", "2ic": "yes",
      head_of_administration: "yes", chief_staff_officer: "yes",
      staff_officer: "view", supervisor: "view",
    },
  },
  {
    key: "import",
    name: "Import recipients / rules",
    icon: Upload,
    description: "Upload distribution lists or attachment-rule presets (xlsx/csv).",
    access: {
      admin: "yes", oic: "yes", "2ic": "yes",
      head_of_administration: "yes", chief_staff_officer: "yes",
    },
  },
];

function cell(a?: Access) {
  if (a === "yes")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
        <Check className="h-3 w-3 mr-1" />
        Allow
      </Badge>
    );
  if (a === "view")
    return (
      <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px]">
        Read-only
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-destructive/60 border-destructive/20 text-[10px]">
      <X className="h-3 w-3 mr-1" />
      Blocked
    </Badge>
  );
}

export function InterlinkPermissionsMatrix() {
  return (
    <div className="space-y-4 interlink-perm-print-area">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-600" /> Interlink Permissions Matrix
          </h2>
          <p className="text-xs text-muted-foreground">
            Who can View, Approve, Export, and Import Interlink data. Mirrors UI gating + RLS on{" "}
            <code className="text-[11px]">interlink_dispatches</code>.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 no-print" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
      </div>

      <Alert className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle className="text-sm">Sign-off is restricted</AlertTitle>
        <AlertDescription className="text-xs">
          Read-only roles (Staff Officer, Supervisor) can browse dispatches and exports but cannot mutate them.
          Roles outside the command tier are blocked at both the UI and the RLS layer.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Action access by role</CardTitle>
          <CardDescription className="text-xs">
            <strong>Allow</strong> = perform · <strong>Read-only</strong> = view results · <strong>Blocked</strong> = hidden / RLS denied
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto" style={{ minWidth: 700 }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[200px]">Action</TableHead>
                  {ROLES_DISPLAYED.map((r) => (
                    <TableHead key={r} className="text-center text-[10px] min-w-[80px]">
                      {ROLE_LABEL[r] ?? roleLabel(r)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <TableRow key={a.key}>
                      <TableCell className="sticky left-0 bg-card z-10 align-top">
                        <div className="font-medium text-xs flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                          {a.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{a.description}</div>
                      </TableCell>
                      {ROLES_DISPLAYED.map((r) => (
                        <TableCell key={r} className="text-center">
                          {cell(a.access[r])}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default InterlinkPermissionsMatrix;
