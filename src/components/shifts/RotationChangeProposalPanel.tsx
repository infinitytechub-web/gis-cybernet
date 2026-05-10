import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Plus, Repeat, ShieldCheck, Loader2, X, Eye, Users, Check, ChevronsUpDown, UserCircle2 } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ShiftRow = { id: string; name: string; start_time: string | null; end_time: string | null };
const GROUPS = ["A", "B", "C", "D"] as const;
type Group = typeof GROUPS[number];

type Proposal = {
  id: string;
  title: string;
  summary: string;
  status: string;
  effective_from: string;
  pattern: any;
  reviewer_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  pending:   "bg-warning/15 text-warning border-warning/30",
  approved:  "bg-success/15 text-success border-success/30",
  rejected:  "bg-destructive/15 text-destructive border-destructive/30",
  withdrawn: "bg-muted text-muted-foreground border-border",
  applied:   "bg-primary/15 text-primary border-primary/30",
};

const PROPOSER_ROLES = [
  "admin","staff_officer","oic","2ic","supervisor","ipse_supervisor",
];

export function RotationChangeProposalPanel() {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const canPropose = !!role && PROPOSER_ROLES.includes(role);

  // Available shifts
  const { data: shifts = [] } = useQuery({
    queryKey: ["rotation-proposal-shifts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id, name, start_time, end_time")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ShiftRow[];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["rotation-proposal-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Staff directory for the multi-select
  const { data: staffDirectory = [] } = useQuery({
    queryKey: ["rotation-proposal-staff-directory"],
    enabled: canPropose,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, shift_group")
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null;
        staff_id: string | null; shift_group: string | null;
      }>;
    },
  });

  const { data: mine = [] } = useQuery({
    queryKey: ["rotation-proposals-mine", profile?.id],
    enabled: !!profile?.id && canPropose,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotation_change_proposals")
        .select("id, title, summary, status, effective_from, pattern, reviewer_id, review_comment, reviewed_at, created_at")
        .eq("proposer_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Proposal[];
    },
  });

  // Recently approved/applied proposals — visible to everyone (read-only)
  const { data: recentApproved = [] } = useQuery({
    queryKey: ["rotation-proposals-recent-approved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotation_change_proposals")
        .select("id, title, summary, status, effective_from, pattern, reviewer_id, review_comment, reviewed_at, created_at")
        .in("status", ["approved","applied"])
        .order("effective_from", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Proposal[];
    },
  });

  // ===== Builder dialog state =====
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"cycle"|"reassignment">("reassignment");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(() =>
    format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"),
  );

  // Cycle builder state
  const [cycleDays, setCycleDays] = useState<number>(4);
  const [pattern, setPattern] = useState<Record<Group, string[]>>({ A: [], B: [], C: [], D: [] });

  // Reassignment builder state
  const [raTargetGroup, setRaTargetGroup] = useState<"A"|"B"|"C"|"D"|"ALL">("A");
  const [raDateFrom, setRaDateFrom] = useState<string>(() =>
    format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"));
  const [raDateTo, setRaDateTo] = useState<string>(() =>
    format(new Date(Date.now() + 14 * 86400000), "yyyy-MM-dd"));
  const [raNewShiftId, setRaNewShiftId] = useState<string>("");
  const [raStaffIds, setRaStaffIds] = useState<string[]>([]); // selected profile ids (optional)
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);

  const reset = () => {
    setMode("reassignment");
    setTitle(""); setSummary("");
    setEffectiveFrom(format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"));
    setCycleDays(4);
    setPattern({ A: [], B: [], C: [], D: [] });
    setRaTargetGroup("A");
    setRaDateFrom(format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"));
    setRaDateTo(format(new Date(Date.now() + 14 * 86400000), "yyyy-MM-dd"));
    setRaNewShiftId("");
    setRaStaffIds([]);
  };

  const setSlot = (g: Group, i: number, shiftId: string) => {
    setPattern((p) => {
      const next = { ...p, [g]: [...(p[g] ?? [])] };
      while (next[g].length < cycleDays) next[g].push("");
      next[g][i] = shiftId;
      return next;
    });
  };

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (title.trim().length < 4) errs.push("Title is too short.");
    if (summary.trim().length < 10) errs.push("Justification must be at least 10 characters.");

    if (mode === "cycle") {
      if (!effectiveFrom) errs.push("Pick an effective-from date.");
      if (cycleDays < 2 || cycleDays > 28) errs.push("Cycle length must be between 2 and 28 days.");
      let assigned = 0;
      GROUPS.forEach((g) => {
        for (let i = 0; i < cycleDays; i++) if (pattern[g]?.[i]) assigned++;
      });
      if (assigned === 0) errs.push("Assign at least one shift in the cycle grid.");
    } else {
      if (!raDateFrom || !raDateTo) errs.push("Pick the reassignment date range.");
      if (raDateFrom && raDateTo && raDateTo < raDateFrom) errs.push("End date must be after start date.");
      if (!raNewShiftId) errs.push("Pick the new shift type.");
    }
    return errs;
  }, [mode, title, summary, effectiveFrom, cycleDays, pattern, raDateFrom, raDateTo, raNewShiftId]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !user?.id) throw new Error("Profile not loaded");
      if (validation.length) throw new Error(validation[0]);

      let payload: any;
      let effective: string;

      if (mode === "cycle") {
        const trimmed: Record<string, (string | null)[]> = {};
        GROUPS.forEach((g) => {
          const arr = (pattern[g] ?? []).slice(0, cycleDays);
          while (arr.length < cycleDays) arr.push("");
          trimmed[g] = arr.map((s) => s || null);
        });
        payload = { scope: "unit_wide", cycle_days: cycleDays, groups: trimmed };
        effective = effectiveFrom;
      } else {
        const selected = staffDirectory.filter((s) => raStaffIds.includes(s.id));
        payload = {
          scope: "reassignment",
          target_group: raTargetGroup,
          date_from: raDateFrom,
          date_to: raDateTo,
          new_shift_id: raNewShiftId,
          staff_profile_ids: raStaffIds,
          staff_ids: selected.map((s) => s.staff_id).filter(Boolean),
          staff_names: selected.map((s) => `${s.last_name ?? ""}, ${s.first_name ?? ""}`.trim()),
        };
        effective = raDateFrom;
      }

      const { error } = await supabase.from("rotation_change_proposals").insert({
        proposer_id: profile.id,
        proposer_user_id: user.id,
        title: title.trim(),
        summary: summary.trim(),
        effective_from: effective,
        pattern: payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rotation proposal submitted for approval");
      qc.invalidateQueries({ queryKey: ["rotation-proposals-mine"] });
      qc.invalidateQueries({ queryKey: ["rotation-proposals-queue"] });
      reset();
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message || "Submission failed"),
  });

  const withdraw = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rotation_change_proposals")
        .update({ status: "withdrawn" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposal withdrawn");
      qc.invalidateQueries({ queryKey: ["rotation-proposals-mine"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const shiftName = (id?: string | null) =>
    shifts.find((s) => s.id === id)?.name ?? (id ? "Unknown" : "Off");

  // ===== Read-only view for non-authorized users =====
  if (!canPropose) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            Shift Rotation — Read-only
            <Badge variant="outline" className="ml-auto text-[10px]">View access</Badge>
          </CardTitle>
          <CardDescription>
            Only Admins, Staff Officers, OIC, 2IC, Supervisors, and the Head of IPSE can
            propose rotation changes. You can review the latest approved rotations below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentApproved.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No approved rotation changes yet.
            </p>
          ) : (
            <div className="border rounded-lg divide-y">
              {recentApproved.map((p) => (
                <div key={p.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{p.title}</span>
                    <Badge variant="outline" className={`text-[10px] ml-auto ${STATUS_TONE[p.status]}`}>
                      {p.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Effective {p.effective_from}
                    {p.pattern?.scope === "reassignment"
                      ? ` • Group ${p.pattern.target_group} → ${shiftName(p.pattern.new_shift_id)} (${p.pattern.date_from} → ${p.pattern.date_to})`
                      : ` • Cycle ${p.pattern?.cycle_days ?? "?"}d`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-secondary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Repeat className="h-4 w-4 text-secondary" />
          Rotation Reassignment & Configuration
          <Badge variant="outline" className="ml-auto text-[10px] gap-1">
            <ShieldCheck className="h-3 w-3" /> Approval required
          </Badge>
        </CardTitle>
        <CardDescription>
          Propose multi-day reassignments or revise the unit-wide rotation pattern.
          All submissions are reviewed by Admin, OIC, 2IC, Chief Staff Officer, or
          Head of Administration before they take effect.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <Button onClick={() => setOpen(true)} className="gap-2" size="sm">
          <Plus className="h-4 w-4" /> New rotation proposal
        </Button>

        {mine.length > 0 && (
          <div className="border rounded-lg divide-y">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
              My recent proposals
            </div>
            {mine.map((p) => (
              <div key={p.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {p.pattern?.scope === "reassignment"
                      ? `Reassignment • Group ${p.pattern.target_group} → ${shiftName(p.pattern.new_shift_id)} • ${p.pattern.date_from} → ${p.pattern.date_to}`
                      : `Cycle pattern • ${p.pattern?.cycle_days ?? "?"}d • effective ${p.effective_from}`}
                    {" • "}submitted {format(new Date(p.created_at), "dd MMM HH:mm")}
                  </div>
                  {p.review_comment && (
                    <div className="text-[11px] mt-0.5 italic text-muted-foreground">
                      Reviewer: {p.review_comment}
                    </div>
                  )}
                </div>
                <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[p.status] ?? ""}`}>
                  {p.status}
                </Badge>
                {p.status === "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => withdraw.mutate(p.id)}
                    disabled={withdraw.isPending}
                  >
                    <X className="h-3 w-3 mr-1" /> Withdraw
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ===== Builder dialog ===== */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New rotation proposal</DialogTitle>
            <DialogDescription>
              Choose between a multi-day reassignment or a full cycle pattern revision.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="reassignment" className="gap-2">
                <Users className="h-3.5 w-3.5" /> Reassignment
              </TabsTrigger>
              <TabsTrigger value="cycle" className="gap-2">
                <Repeat className="h-3.5 w-3.5" /> Cycle pattern
              </TabsTrigger>
            </TabsList>

            {/* Common fields */}
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Group B reassigned to Night for festive week"
                  maxLength={160}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">Justification</Label>
                <Textarea
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Briefly explain the operational reason for this change…"
                />
              </div>
            </div>

            {/* Reassignment tab */}
            <TabsContent value="reassignment" className="space-y-3 mt-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Target group</Label>
                  <Select value={raTargetGroup} onValueChange={(v) => setRaTargetGroup(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Group A</SelectItem>
                      <SelectItem value="B">Group B</SelectItem>
                      <SelectItem value="C">Group C</SelectItem>
                      <SelectItem value="D">Group D</SelectItem>
                      <SelectItem value="ALL">All groups</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">New shift type</Label>
                  <Select value={raNewShiftId} onValueChange={setRaNewShiftId}>
                    <SelectTrigger><SelectValue placeholder="Pick a shift" /></SelectTrigger>
                    <SelectContent>
                      {shifts.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.start_time && s.end_time
                            ? ` (${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)})`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      className="pl-8"
                      value={raDateFrom}
                      onChange={(e) => setRaDateFrom(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd")}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      className="pl-8"
                      value={raDateTo}
                      onChange={(e) => setRaDateTo(e.target.value)}
                      min={raDateFrom || format(new Date(), "yyyy-MM-dd")}
                    />
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs flex items-center gap-2">
                    <UserCircle2 className="h-3.5 w-3.5 opacity-70" />
                    Target specific staff (optional)
                    {raStaffIds.length > 0 && (
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        {raStaffIds.length} selected
                      </Badge>
                    )}
                  </Label>

                  {/* Selected chips */}
                  {raStaffIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5">
                      {raStaffIds.map((id) => {
                        const s = staffDirectory.find((x) => x.id === id);
                        if (!s) return null;
                        return (
                          <Badge key={id} variant="secondary" className="gap-1 pr-1 text-[11px]">
                            <span className="truncate max-w-[180px]">
                              {s.last_name}, {s.first_name}
                              <span className="ml-1 font-mono text-[10px] opacity-70">
                                {s.staff_id}
                              </span>
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${s.first_name} ${s.last_name}`}
                              className="rounded p-0.5 hover:bg-background/60"
                              onClick={() =>
                                setRaStaffIds((prev) => prev.filter((p) => p !== id))
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setRaStaffIds([])}
                      >
                        Clear all
                      </Button>
                    </div>
                  )}

                  {/* Picker */}
                  <Popover open={staffPickerOpen} onOpenChange={setStaffPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={staffPickerOpen}
                        className={cn(
                          "w-full justify-between font-normal h-9",
                          raStaffIds.length === 0 && "text-muted-foreground",
                        )}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <UserCircle2 className="h-4 w-4 shrink-0 opacity-60" />
                          {raStaffIds.length === 0
                            ? "Search and add staff…"
                            : `Add more staff (${raStaffIds.length} selected)`}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
                      <Command
                        filter={(itemValue, search) =>
                          itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                        }
                      >
                        <CommandInput placeholder="Type a name or staff ID…" />
                        <CommandList>
                          <CommandEmpty>No staff match your search.</CommandEmpty>
                          {raTargetGroup !== "ALL" && (
                            <CommandGroup heading={`Group ${raTargetGroup}`}>
                              {staffDirectory
                                .filter((s) => s.shift_group === raTargetGroup)
                                .map((s) => {
                                  const checked = raStaffIds.includes(s.id);
                                  const searchable = `${s.last_name ?? ""} ${s.first_name ?? ""} ${s.staff_id ?? ""}`;
                                  return (
                                    <CommandItem
                                      key={s.id}
                                      value={searchable}
                                      onSelect={() =>
                                        setRaStaffIds((prev) =>
                                          checked ? prev.filter((p) => p !== s.id) : [...prev, s.id],
                                        )
                                      }
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                                      <span className="flex-1 truncate">
                                        {s.last_name}, {s.first_name}
                                      </span>
                                      <span className="ml-2 text-[11px] font-mono text-muted-foreground shrink-0">
                                        {s.staff_id}
                                      </span>
                                    </CommandItem>
                                  );
                                })}
                            </CommandGroup>
                          )}
                          <CommandGroup heading="All staff">
                            {staffDirectory
                              .filter((s) => raTargetGroup === "ALL" || s.shift_group !== raTargetGroup)
                              .map((s) => {
                                const checked = raStaffIds.includes(s.id);
                                const searchable = `${s.last_name ?? ""} ${s.first_name ?? ""} ${s.staff_id ?? ""}`;
                                return (
                                  <CommandItem
                                    key={s.id}
                                    value={searchable}
                                    onSelect={() =>
                                      setRaStaffIds((prev) =>
                                        checked ? prev.filter((p) => p !== s.id) : [...prev, s.id],
                                      )
                                    }
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                                    <span className="flex-1 truncate">
                                      {s.last_name}, {s.first_name}
                                    </span>
                                    <span className="ml-2 text-[10px] uppercase text-muted-foreground shrink-0">
                                      {s.shift_group ? `Grp ${s.shift_group}` : "—"}
                                    </span>
                                    <span className="ml-2 text-[11px] font-mono text-muted-foreground shrink-0">
                                      {s.staff_id}
                                    </span>
                                  </CommandItem>
                                );
                              })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-[11px] text-muted-foreground">
                    Leave empty to apply the reassignment to every member of the target group.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Cycle tab */}
            <TabsContent value="cycle" className="space-y-3 mt-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Effective from</Label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd")}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cycle length (days)</Label>
                  <Input
                    type="number"
                    min={2}
                    max={28}
                    value={cycleDays}
                    onChange={(e) => setCycleDays(Math.max(2, Math.min(28, parseInt(e.target.value || "4", 10))))}
                  />
                </div>
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: 700 }}>
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-2 py-2 text-left">Group</th>
                      {Array.from({ length: cycleDays }, (_, i) => (
                        <th key={i} className="px-2 py-2 text-left">Day {i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {GROUPS.map((g) => (
                      <tr key={g} className="border-t">
                        <td className="px-2 py-2 font-bold">{g}</td>
                        {Array.from({ length: cycleDays }, (_, i) => (
                          <td key={i} className="px-1 py-1">
                            <Select
                              value={pattern[g]?.[i] ?? ""}
                              onValueChange={(v) => setSlot(g, i, v === "__off" ? "" : v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__off">— Off —</SelectItem>
                                {shifts.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>

          {validation.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>{validation[0]}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || validation.length > 0}>
              {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default RotationChangeProposalPanel;
