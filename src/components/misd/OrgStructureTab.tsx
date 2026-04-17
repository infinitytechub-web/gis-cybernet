import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ShieldCheck, Server, Database, FileCheck2, FlaskConical, Users, Crown, Star,
  UserPlus, Search, X, Sparkles, BarChart3, ChevronsUpDown, Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

type Role = { title: string; lead?: boolean };
type Unit = {
  key: string;
  name: string;
  priority?: string;
  icon: any;
  accent: string;
  ring: string;
  description: string;
  roles: Role[];
};

const UNITS: Unit[] = [
  {
    key: "cyber_risk",
    name: "Cybersecurity & Risk Management",
    priority: "Top Priority",
    icon: ShieldCheck,
    accent: "from-purple-700 to-purple-900",
    ring: "border-purple-300 dark:border-purple-800",
    description: "Defends digital assets, manages cyber risk, and leads incident response.",
    roles: [
      { title: "Cybersecurity Analyst" },
      { title: "Cyber Threat Intelligence Analyst" },
      { title: "Information Assurance Specialist" },
    ],
  },
  {
    key: "infra_systems",
    name: "IT Infrastructure & Systems Engineering",
    icon: Server,
    accent: "from-indigo-600 to-purple-800",
    ring: "border-indigo-300 dark:border-indigo-800",
    description: "Designs, deploys, and maintains the network, servers, and core systems.",
    roles: [
      { title: "IT Infrastructure Manager", lead: true },
      { title: "Network Architect" },
      { title: "Systems Engineer" },
    ],
  },
  {
    key: "data_analytics",
    name: "Data Analytics & Intelligence",
    icon: Database,
    accent: "from-fuchsia-600 to-purple-800",
    ring: "border-fuchsia-300 dark:border-fuchsia-800",
    description: "Transforms operational data into actionable intelligence and decision support.",
    roles: [
      { title: "Data Scientist" },
      { title: "Intelligence Data Analyst" },
    ],
  },
  {
    key: "governance",
    name: "Information Governance & Compliance",
    icon: FileCheck2,
    accent: "from-amber-600 to-purple-800",
    ring: "border-amber-300 dark:border-amber-800",
    description: "Enforces policy, regulatory compliance, and information assurance standards.",
    roles: [
      { title: "Information Assurance Specialist" },
    ],
  },
  {
    key: "cyber_ops",
    name: "Cyber Operations & Innovation Lab",
    icon: FlaskConical,
    accent: "from-purple-600 to-amber-700",
    ring: "border-purple-300 dark:border-purple-800",
    description: "Runs offensive/defensive operations and prototypes new capabilities.",
    roles: [
      { title: "Cyber Operations Specialist" },
      { title: "Software Developer" },
    ],
  },
];

const PURPLE_PALETTE = ["#6d28d9", "#9333ea", "#a855f7", "#c084fc", "#d8b4fe"];

export function OrgStructureTab() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const canManage = ["admin", "oic", "2ic"].includes(role || "");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUnit, setAssignUnit] = useState<Unit | null>(null);

  const { data: profiles = [] } = useQuery({
    queryKey: ["misd-staff-pool"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, departments:department_id(id, name), ranks:rank_id(id, name)")
        .order("last_name");
      return data || [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["misd_unit_assignments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("misd_unit_assignments")
        .select("*, profiles:profile_id(id, first_name, last_name, staff_id, photo_url, ranks:rank_id(name))")
        .order("assigned_at", { ascending: false });
      return data || [];
    },
  });

  const totalRoles = UNITS.reduce((sum, u) => sum + u.roles.length, 0);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    UNITS.forEach((u) => (map[u.key] = []));
    assignments.forEach((a: any) => {
      if (map[a.unit_key]) map[a.unit_key].push(a);
    });
    return map;
  }, [assignments]);

  const analytics = useMemo(() => {
    const byUnit = UNITS.map((u) => ({
      name: u.name.split(" & ")[0].replace("Information ", "Info "),
      value: grouped[u.key]?.length || 0,
      key: u.key,
    }));
    const activeUnits = byUnit.filter((u) => u.value > 0).length;
    const leads = assignments.filter((a: any) => a.is_lead).length;
    return { byUnit, activeUnits, leads, total: assignments.length };
  }, [assignments, grouped]);

  // Auto-assign: distribute MISD/CYBER department staff across units round-robin
  const autoAssign = useMutation({
    mutationFn: async () => {
      const misdStaff = profiles.filter(
        (p: any) => p.departments?.name?.toLowerCase().includes("cyber") ||
                    p.departments?.name?.toLowerCase().includes("misd") ||
                    p.departments?.name?.toLowerCase().includes("it"),
      );
      if (misdStaff.length === 0) throw new Error("No MISD/CYBER department staff found");
      const assignedIds = new Set(assignments.map((a: any) => a.profile_id));
      const toAssign = misdStaff.filter((p: any) => !assignedIds.has(p.id));
      if (toAssign.length === 0) throw new Error("All MISD/CYBER staff already assigned");

      const rows = toAssign.map((p: any, i: number) => {
        const unit = UNITS[i % UNITS.length];
        return {
          profile_id: p.id,
          unit_key: unit.key,
          unit_name: unit.name,
          role_title: unit.roles[0]?.title || null,
          is_lead: false,
        };
      });
      const { error } = await supabase.from("misd_unit_assignments").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ["misd_unit_assignments"] }); toast.success(`Auto-assigned ${n} staff`); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("misd_unit_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["misd_unit_assignments"] }); toast.success("Removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <Card className="border-purple-200 dark:border-purple-900 bg-gradient-to-r from-purple-50 to-amber-50 dark:from-purple-950/40 dark:to-amber-950/30">
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-700 to-purple-900 flex items-center justify-center shadow-md shadow-purple-500/30">
              <Users className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-purple-900 dark:text-purple-200">MISD / CYBER Organisational Structure</h2>
              <p className="text-xs text-muted-foreground">Defined roles & functional units aligned with global cyber best practices.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-purple-700 text-amber-200 hover:bg-purple-700">{UNITS.length} Units</Badge>
            <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">{totalRoles} Role Types</Badge>
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{analytics.total} Assigned</Badge>
            {canManage && (
              <Button size="sm" variant="outline" className="border-purple-400 text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                onClick={() => autoAssign.mutate()} disabled={autoAssign.isPending}>
                <Sparkles className="h-3.5 w-3.5 mr-1" />Auto-assign MISD staff
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Analytics dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <StatCard label="Total Assigned" value={analytics.total} icon={Users} tone="purple" />
        <StatCard label="Active Units" value={`${analytics.activeUnits}/${UNITS.length}`} icon={ShieldCheck} tone="emerald" />
        <StatCard label="Unit Leads" value={analytics.leads} icon={Crown} tone="amber" />

        <Card className="border-purple-200 dark:border-purple-900 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-700 dark:text-purple-300" />Staff per Unit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.byUnit}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={9} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis fontSize={10} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {analytics.byUnit.map((_, i) => <Cell key={i} fill={PURPLE_PALETTE[i % PURPLE_PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChartIcon />Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={analytics.byUnit.filter((d) => d.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} fontSize={9}>
                  {analytics.byUnit.map((_, i) => <Cell key={i} fill={PURPLE_PALETTE[i % PURPLE_PALETTE.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 9 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Unit cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {UNITS.map((u) => {
          const unitAssigned = grouped[u.key] || [];
          return (
            <Card key={u.key} className={`border-2 ${u.ring} overflow-hidden`}>
              <div className={`h-1.5 bg-gradient-to-r ${u.accent}`} />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className={`h-9 w-9 rounded-md bg-gradient-to-br ${u.accent} flex items-center justify-center shadow shadow-purple-500/20`}>
                      <u.icon className="h-4 w-4 text-amber-200" />
                    </div>
                    <div>
                      <CardTitle className="text-sm leading-tight">{u.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{u.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {u.priority && (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                        <Star className="h-3 w-3 mr-1 fill-white" />{u.priority}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-800 dark:text-purple-200">
                      {unitAssigned.length} assigned
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-1 space-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Role Types</p>
                  <ul className="space-y-1">
                    {u.roles.map((r) => (
                      <li
                        key={r.title}
                        className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded border border-purple-100 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20"
                      >
                        <span className="flex items-center gap-2">
                          {r.lead ? <Crown className="h-3 w-3 text-amber-600" /> : <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />}
                          <span className={r.lead ? "font-semibold text-purple-900 dark:text-purple-200" : ""}>{r.title}</span>
                        </span>
                        {r.lead && (
                          <Badge variant="outline" className="text-[9px] h-4 border-amber-500 text-amber-700 dark:text-amber-300">Unit Lead</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Assigned Staff</p>
                    {canManage && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                        onClick={() => { setAssignUnit(u); setAssignOpen(true); }}>
                        <UserPlus className="h-3 w-3 mr-1" />Assign
                      </Button>
                    )}
                  </div>
                  {unitAssigned.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic px-2 py-1.5">No staff assigned yet.</p>
                  ) : (
                    <ul className="space-y-1 max-h-44 overflow-y-auto pr-1">
                      {unitAssigned.map((a: any) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-background border border-border">
                          <div className="flex items-center gap-2 min-w-0">
                            {a.is_lead && <Crown className="h-3 w-3 text-amber-600 shrink-0" />}
                            <span className="truncate font-medium">
                              {a.profiles?.first_name} {a.profiles?.last_name}
                            </span>
                            <span className="text-muted-foreground text-[10px] truncate">
                              {a.profiles?.ranks?.name && `· ${a.profiles.ranks.name}`}
                              {a.role_title && ` · ${a.role_title}`}
                            </span>
                          </div>
                          {canManage && (
                            <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-destructive"
                              onClick={() => remove.mutate(a.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {assignOpen && assignUnit && (
        <AssignDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          unit={assignUnit}
          profiles={profiles}
          existingProfileIds={new Set((grouped[assignUnit.key] || []).map((a: any) => a.profile_id))}
        />
      )}
    </div>
  );
}

function PieChartIcon() {
  return <BarChart3 className="h-4 w-4 text-purple-700 dark:text-purple-300" />;
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: any; icon: any; tone: "purple" | "amber" | "emerald" }) {
  const styles = {
    purple: "border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800 text-purple-800 dark:text-purple-200",
    amber: "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-800 dark:text-amber-200",
    emerald: "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200",
  }[tone];
  return (
    <Card className={cn("border-2", styles)}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs opacity-80">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <Icon className="h-7 w-7 opacity-70" />
      </CardContent>
    </Card>
  );
}

function AssignDialog({
  open, onClose, unit, profiles, existingProfileIds,
}: {
  open: boolean; onClose: () => void; unit: Unit; profiles: any[]; existingProfileIds: Set<string>;
}) {
  const qc = useQueryClient();
  const [profileId, setProfileId] = useState("");
  const [roleTitle, setRoleTitle] = useState(unit.roles[0]?.title || "");
  const [isLead, setIsLead] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);

  const available = profiles.filter((p: any) => !existingProfileIds.has(p.id));
  const selected = profiles.find((p: any) => p.id === profileId);

  const save = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error("Select a staff member");
      const { error } = await supabase.from("misd_unit_assignments").insert({
        profile_id: profileId,
        unit_key: unit.key,
        unit_name: unit.name,
        role_title: roleTitle || null,
        is_lead: isLead,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["misd_unit_assignments"] });
      toast.success("Staff assigned");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <unit.icon className="h-5 w-5 text-purple-700 dark:text-purple-300" />
            Assign to {unit.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium mb-1 block">Staff Member</label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selected ? `${selected.first_name} ${selected.last_name}${selected.staff_id ? ` (${selected.staff_id})` : ""}` : "Search staff…"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by name, staff ID, dept…" />
                  <CommandList>
                    <CommandEmpty>No staff found.</CommandEmpty>
                    <CommandGroup>
                      {available.slice(0, 200).map((p: any) => {
                        const label = `${p.first_name} ${p.last_name}`;
                        const meta = [p.staff_id, p.ranks?.name, p.departments?.name].filter(Boolean).join(" · ");
                        return (
                          <CommandItem
                            key={p.id}
                            value={`${label} ${p.staff_id || ""} ${p.departments?.name || ""}`}
                            onSelect={() => { setProfileId(p.id); setComboOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", profileId === p.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span className="text-sm">{label}</span>
                              {meta && <span className="text-[10px] text-muted-foreground">{meta}</span>}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Role</label>
            <Select value={roleTitle} onValueChange={setRoleTitle}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {unit.roles.map((r) => <SelectItem key={r.title} value={r.title}>{r.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={isLead} onCheckedChange={(v) => setIsLead(!!v)} />
            <Crown className="h-3.5 w-3.5 text-amber-600" />
            Mark as Unit Lead
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-purple-700 hover:bg-purple-800 text-amber-100">
            <UserPlus className="h-4 w-4 mr-1" />Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
