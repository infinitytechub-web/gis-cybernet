import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Eye, Pencil, Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExportMenu } from "@/components/ui/export-menu";

const roles = ["admin", "oic", "2ic", "head_of_administration", "chief_staff_officer", "supervisor", "ipse_supervisor", "ipse_deputy_supervisor", "shift_supervisor", "deputy_shift_supervisor", "shift_leader", "deputy_supervisor", "deputy_shift_leader", "special_duties", "deputy", "front_desk", "staff"] as const;

const roleLabels: Record<string, string> = {
  admin: "Admin",
  oic: "Command OIC",
  "2ic": "2IC",
  head_of_administration: "Head of Administration",
  chief_staff_officer: "Chief Staff Officer",
  supervisor: "Supervisor",
  ipse_supervisor: "IPSE Supervisor",
  ipse_deputy_supervisor: "IPSE Dep. Supervisor",
  shift_supervisor: "Shift Supervisor",
  deputy_shift_supervisor: "Dep. Shift Supervisor",
  shift_leader: "Shift Leader",
  deputy_supervisor: "Dep. Supervisor",
  deputy_shift_leader: "Dep. Shift Leader",
  special_duties: "Special Duties",
  deputy: "Deputy",
  front_desk: "Front Desk",
  staff: "Staff",
};

type Access = "full" | "dept" | "own" | "view" | "none";

const baseFeatures: { name: string; access: Record<string, Access> }[] = [
  {
    name: "Dashboard",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "full", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "full", deputy_shift_supervisor: "full", shift_leader: "full", deputy_supervisor: "full", deputy_shift_leader: "full", special_duties: "full", deputy: "full", front_desk: "full", staff: "full" },
  },
  {
    name: "Staff / Employees",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "dept", deputy_shift_supervisor: "dept", shift_leader: "dept", deputy_supervisor: "dept", deputy_shift_leader: "dept", special_duties: "view", deputy: "view", front_desk: "none", staff: "view" },
  },
  {
    name: "Staff Directory",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "full", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "full", deputy_shift_supervisor: "full", shift_leader: "full", deputy_supervisor: "full", deputy_shift_leader: "full", special_duties: "full", deputy: "full", front_desk: "view", staff: "full" },
  },
  {
    name: "Departments",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "view", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "view", deputy_shift_supervisor: "view", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "view", deputy: "view", front_desk: "none", staff: "view" },
  },
  {
    name: "Roles / Ranks",
    access: { admin: "full", oic: "full", "2ic": "view", supervisor: "view", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "view", deputy_shift_supervisor: "view", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "view", deputy: "view", front_desk: "none", staff: "view" },
  },
  {
    name: "Attendance",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "dept", deputy_shift_supervisor: "dept", shift_leader: "dept", deputy_supervisor: "dept", deputy_shift_leader: "dept", special_duties: "own", deputy: "own", front_desk: "own", staff: "own" },
  },
  {
    name: "Leave Requests",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "dept", deputy_shift_supervisor: "dept", shift_leader: "dept", deputy_supervisor: "dept", deputy_shift_leader: "view", special_duties: "own", deputy: "own", front_desk: "own", staff: "own" },
  },
  {
    name: "Postings & Transfers",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "view", deputy_shift_supervisor: "view", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "own", deputy: "own", front_desk: "none", staff: "own" },
  },
  {
    name: "Duty Roster",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "dept", deputy_shift_supervisor: "dept", shift_leader: "view", deputy_supervisor: "dept", deputy_shift_leader: "dept", special_duties: "view", deputy: "view", front_desk: "view", staff: "own" },
  },
  {
    name: "Announcements",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "view", deputy_shift_supervisor: "view", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "view", deputy: "view", front_desk: "view", staff: "view" },
  },
  {
    name: "Compliance",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "view", deputy_shift_supervisor: "view", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "view", deputy: "view", front_desk: "none", staff: "own" },
  },
  {
    name: "Reports",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "view", deputy_shift_supervisor: "view", shift_leader: "view", deputy_supervisor: "view", deputy_shift_leader: "view", special_duties: "none", deputy: "none", front_desk: "none", staff: "none" },
  },
  {
    name: "Front Desk — Visa Apps",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "dept", deputy_shift_supervisor: "dept", shift_leader: "dept", deputy_supervisor: "none", deputy_shift_leader: "none", special_duties: "none", deputy: "none", front_desk: "own", staff: "none" },
  },
  {
    name: "Front Desk — Extensions",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "dept", deputy_shift_supervisor: "dept", shift_leader: "dept", deputy_supervisor: "none", deputy_shift_leader: "none", special_duties: "none", deputy: "none", front_desk: "own", staff: "none" },
  },
  {
    name: "Front Desk — Passport",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "dept", deputy_shift_supervisor: "dept", shift_leader: "dept", deputy_supervisor: "none", deputy_shift_leader: "none", special_duties: "none", deputy: "none", front_desk: "own", staff: "none" },
  },
  {
    name: "Front Desk — Official",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "dept", deputy_shift_supervisor: "dept", shift_leader: "dept", deputy_supervisor: "none", deputy_shift_leader: "none", special_duties: "none", deputy: "none", front_desk: "own", staff: "none" },
  },
  {
    name: "Front Desk — Enquiry",
    access: { admin: "full", oic: "full", "2ic": "full", supervisor: "dept", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "dept", deputy_shift_supervisor: "dept", shift_leader: "dept", deputy_supervisor: "none", deputy_shift_leader: "none", special_duties: "none", deputy: "none", front_desk: "own", staff: "none" },
  },
  {
    name: "Front Desk — Audit Log",
    access: { admin: "full", oic: "view", "2ic": "view", supervisor: "none", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "none", deputy_shift_supervisor: "none", shift_leader: "none", deputy_supervisor: "none", deputy_shift_leader: "none", special_duties: "none", deputy: "none", front_desk: "own", staff: "none" },
  },
  {
    name: "Settings / User Roles",
    access: { admin: "full", oic: "full", "2ic": "view", supervisor: "none", ipse_supervisor: "full", ipse_deputy_supervisor: "full", shift_supervisor: "none", deputy_shift_supervisor: "none", shift_leader: "none", deputy_supervisor: "none", deputy_shift_leader: "none", special_duties: "none", deputy: "none", front_desk: "none", staff: "none" },
  },
];

// Head of Administration & Chief Staff Officer share full command-tier access (mirrors 2IC).
const defaultFeatures: { name: string; access: Record<string, Access> }[] = baseFeatures.map((feature) => ({
  ...feature,
  access: {
    ...feature.access,
    head_of_administration: feature.access["2ic"],
    chief_staff_officer: feature.access["2ic"],
  },
}));

const accessOptions: Access[] = ["full", "dept", "own", "view", "none"];

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
  const [features, setFeatures] = useState(defaultFeatures);
  const [editing, setEditing] = useState(false);

  const handleAccessChange = (featureIdx: number, role: string, newAccess: Access) => {
    setFeatures((prev) => {
      const updated = [...prev];
      updated[featureIdx] = {
        ...updated[featureIdx],
        access: { ...updated[featureIdx].access, [role]: newAccess },
      };
      return updated;
    });
  };

  const handleSave = () => {
    setEditing(false);
    toast.success("Permissions matrix updated for this session");
  };

  const handleReset = () => {
    setFeatures(defaultFeatures);
    setEditing(false);
    toast.info("Permissions matrix reset to defaults");
  };

  const buildExportData = () => {
    const headers = ["Feature", ...roles.map((r) => roleLabels[r])];
    const rows = features.map((f) => [f.name, ...roles.map((r) => f.access[r]?.toUpperCase() ?? "")]);
    return {
      title: "Permissions Matrix",
      filename: `permissions-matrix-${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      subtitle: "Access levels for each role across system features",
    };
  };

  return (
    <Card className="permissions-print-area">
      <div className="print-only hidden mb-4 px-6 pt-6">
        <h1 className="text-lg font-bold" style={{ color: "#006699" }}>GIS Amasaman Sector Command</h1>
        <p className="text-sm text-muted-foreground">Permissions Matrix — Generated {new Date().toLocaleDateString()}</p>
      </div>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">Permissions Matrix</CardTitle>
            <CardDescription>Reference chart showing access levels for each role across system features.</CardDescription>
          </div>
          <div className="flex gap-2 no-print">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            <ExportMenu getData={buildExportData} className="gap-1" />
            {editing ? (
              <>
                <Button size="sm" variant="outline" onClick={handleReset}>Reset</Button>
                <Button size="sm" onClick={handleSave}>Save Changes</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1">
                <Pencil className="h-3.5 w-3.5" /> Edit Access
              </Button>
            )}
          </div>
        </div>
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
              {features.map((f, fi) => (
                <TableRow key={f.name}>
                  <TableCell className="sticky left-0 bg-card z-10 font-medium text-xs">{f.name}</TableCell>
                  {roles.map((r) => (
                    <TableCell key={r} className="text-center">
                      {editing ? (
                        <Select value={f.access[r]} onValueChange={(v) => handleAccessChange(fi, r, v as Access)}>
                          <SelectTrigger className="h-7 text-[10px] w-[70px] mx-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {accessOptions.map((opt) => (
                              <SelectItem key={opt} value={opt} className="text-xs">{opt.charAt(0).toUpperCase() + opt.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        accessBadge(f.access[r])
                      )}
                    </TableCell>
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
        <div className="print-only hidden mt-6 pt-4 border-t border-border text-xs" style={{ color: "#666" }}>
          <p className="font-semibold">CONFIDENTIAL — For Official Use Only</p>
          <p>This document contains sensitive access control information. Unauthorized distribution is prohibited.</p>
          <p className="mt-1">Printed by authorized personnel on {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} • Powered by Infinity Techub Intelligence</p>
        </div>
      </CardContent>
    </Card>
  );
}
