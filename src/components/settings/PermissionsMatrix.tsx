import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Eye } from "lucide-react";

const roles = ["admin", "supervisor", "shift_leader", "deputy_supervisor", "deputy_shift_leader", "special_duties", "deputy", "staff"] as const;

const roleLabels: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  shift_leader: "Shift Leader",
  deputy_supervisor: "Dep. Supervisor",
  deputy_shift_leader: "Dep. Shift Leader",
  special_duties: "Special Duties",
  deputy: "Deputy",
  staff: "Staff",
};

type Access = "full" | "dept" | "own" | "view" | "none";

const features: { name: string; access: Record<string, Access> }[] = [
  {
    name: "Dashboard",
    access: { admin: "full", supervisor: "full", shift_leader: "full", deputy_supervisor: "full", deputy_shift_leader: "full", special_duties: "full", deputy: "full", staff: "full" },
  },
  {
    name: "Staff / Employees",
    access: { admin: "full", supervisor: "dept", shift_leader: "dept", deputy_supervisor: "dept", deputy_shift_leader: "dept", special_duties: "view", deputy: "view", staff: "own" },
  },
  {
    name: "Staff Directory",
    access: { admin: "full", supervisor: "full", shift_leader: "full", deputy_supervisor: "full", deputy_shift_leader: "full", special_duties: "full", deputy: "full", staff: "full" },
  },
  {
    name: "Departments",
    access: { admin: "full", supervisor: "view", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "view", deputy: "view", staff: "view" },
  },
  {
    name: "Roles / Ranks",
    access: { admin: "full", supervisor: "view", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "view", deputy: "view", staff: "view" },
  },
  {
    name: "Attendance",
    access: { admin: "full", supervisor: "dept", shift_leader: "dept", deputy_supervisor: "dept", deputy_shift_leader: "dept", special_duties: "own", deputy: "own", staff: "own" },
  },
  {
    name: "Leave Requests",
    access: { admin: "full", supervisor: "dept", shift_leader: "dept", deputy_supervisor: "dept", deputy_shift_leader: "view", special_duties: "own", deputy: "own", staff: "own" },
  },
  {
    name: "Postings & Transfers",
    access: { admin: "full", supervisor: "dept", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "own", deputy: "own", staff: "own" },
  },
  {
    name: "Duty Roster",
    access: { admin: "full", supervisor: "dept", shift_leader: "dept", deputy_supervisor: "dept", deputy_shift_leader: "dept", special_duties: "view", deputy: "view", staff: "own" },
  },
  {
    name: "Announcements",
    access: { admin: "full", supervisor: "dept", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "view", deputy: "view", staff: "view" },
  },
  {
    name: "Compliance",
    access: { admin: "full", supervisor: "dept", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "view", deputy: "view", staff: "own" },
  },
  {
    name: "Reports",
    access: { admin: "full", supervisor: "dept", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "none", deputy: "none", staff: "none" },
  },
  {
    name: "Settings / User Roles",
    access: { admin: "full", supervisor: "none", shift_leader: "none", deputy_supervisor: "none", deputy_shift_leader: "none", special_duties: "none", deputy: "none", staff: "none" },
  },
];

const accessBadge = (level: Access) => {
  switch (level) {
    case "full":
      return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1 text-[10px]"><Check className="h-3 w-3" />Full</Badge>;
    case "dept":
      return <Badge className="bg-sky-500/15 text-sky-600 border-sky-500/30 gap-1 text-[10px]"><Eye className="h-3 w-3" />Dept</Badge>;
    case "own":
      return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1 text-[10px]"><Eye className="h-3 w-3" />Own</Badge>;
    case "view":
      return <Badge className="bg-muted text-muted-foreground border-border gap-1 text-[10px]"><Eye className="h-3 w-3" />View</Badge>;
    case "none":
      return <Badge variant="outline" className="text-destructive/60 border-destructive/20 gap-1 text-[10px]"><X className="h-3 w-3" />None</Badge>;
  }
};

export function PermissionsMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">Permissions Matrix</CardTitle>
        <CardDescription>Reference chart showing access levels for each role across system features.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">Feature</TableHead>
                {roles.map((r) => (
                  <TableHead key={r} className="text-center text-[11px] min-w-[80px]">{roleLabels[r]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {features.map((f) => (
                <TableRow key={f.name}>
                  <TableCell className="sticky left-0 bg-card z-10 font-medium text-xs">{f.name}</TableCell>
                  {roles.map((r) => (
                    <TableCell key={r} className="text-center">{accessBadge(f.access[r])}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" /> Full — Complete CRUD access</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-sky-600" /> Dept — Department-scoped access</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-amber-600" /> Own — Own records only</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-muted-foreground" /> View — Read-only</span>
          <span className="flex items-center gap-1"><X className="h-3 w-3 text-destructive/60" /> None — No access</span>
        </div>
      </CardContent>
    </Card>
  );
}
