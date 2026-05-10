import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Plus, Repeat, ShieldCheck, Loader2, X } from "lucide-react";
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

export function RotationChangeProposalPanel() {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  // Local check that mirrors the DB rule (also enforced server-side via RLS).
  const canPropose = !!role && [
    "admin","staff_officer","oic","2ic","supervisor","ipse_supervisor",
  ].includes(role);

  // Available shifts for the cycle builder
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
    enabled: canPropose,
  });

  // The proposer's own profile id
  const { data: profile } = useQuery({
    queryKey: ["rotation-proposal-profile", user?.id],
    enabled: !!user?.id && canPropose,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // My recent proposals
  const { data: mine = [] } = useQuery({
    queryKey: ["rotation-proposals-mine", profile?.id],
    enabled: !!profile?.id,
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

  // ===== Builder state =====
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(() =>
    format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"),
  );
  const [cycleDays, setCycleDays] = useState<number>(4);
  // pattern[group][dayIndex] = shift_id
  const [pattern, setPattern] = useState<Record<Group, string[]>>({
    A: [], B: [], C: [], D: [],
  });

  const reset = () => {
    setTitle(""); setSummary("");
    setEffectiveFrom(format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"));
    setCycleDays(4);
    setPattern({ A: [], B: [], C: [], D: [] });
  };

  const setSlot = (g: Group, i: number, shiftId: string) => {
    setPattern((p) => {
      const next = { ...p, [g]: [...(p[g] ?? [])] };
      // pad if needed
      while (next[g].length < cycleDays) next[g].push("");
      next[g][i] = shiftId;
      return next;
    });
  };

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (title.trim().length < 4) errs.push("Title is too short.");
    if (summary.trim().length < 10) errs.push("Justification must be at least 10 characters.");
    if (!effectiveFrom) errs.push("Pick an effective-from date.");
    if (cycleDays < 2 || cycleDays > 28) errs.push("Cycle length must be between 2 and 28 days.");
    let assigned = 0;
    GROUPS.forEach((g) => {
      for (let i = 0; i < cycleDays; i++) {
        if (pattern[g]?.[i]) assigned++;
      }
    });
    if (assigned === 0) errs.push("Assign at least one shift in the cycle grid.");
    return errs;
  }, [title, summary, effectiveFrom, cycleDays, pattern]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !user?.id) throw new Error("Profile not loaded");
      if (validation.length) throw new Error(validation[0]);
      // Trim pattern arrays to cycleDays
      const trimmed: Record<string, (string | null)[]> = {};
      GROUPS.forEach((g) => {
        const arr = (pattern[g] ?? []).slice(0, cycleDays);
        while (arr.length < cycleDays) arr.push("");
        trimmed[g] = arr.map((s) => s || null);
      });
      const { error } = await supabase.from("rotation_change_proposals").insert({
        proposer_id: profile.id,
        proposer_user_id: user.id,
        title: title.trim(),
        summary: summary.trim(),
        effective_from: effectiveFrom,
        pattern: { cycle_days: cycleDays, groups: trimmed, scope: "unit_wide" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rotation proposal submitted for approval");
      qc.invalidateQueries({ queryKey: ["rotation-proposals-mine"] });
      qc.invalidateQueries({ queryKey: ["rotation-proposals-pending"] });
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

  if (!canPropose) return null;

  return (
    <Card className="border-secondary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Repeat className="h-4 w-4 text-secondary" />
          Shift Rotation — Configuration
          <Badge variant="outline" className="ml-auto text-[10px] gap-1">
            <ShieldCheck className="h-3 w-3" /> Approval required
          </Badge>
        </CardTitle>
        <CardDescription>
          Propose changes to the unit-wide rotation pattern (groups A–D). Submitted
          proposals are reviewed by the Admin, OIC, 2IC, Chief Staff Officer, or
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
                    Effective {p.effective_from} • cycle {p.pattern?.cycle_days}d •
                    submitted {format(new Date(p.created_at), "dd MMM HH:mm")}
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
              Define the new cycle. Each group (A–D) gets a sequence of shifts that
              repeats over the chosen cycle length.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q3 Rotation Adjustment"
                maxLength={160}
              />
            </div>
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
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">Justification</Label>
              <Textarea
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Briefly explain why the rotation needs to change…"
              />
            </div>
          </div>

          {/* Cycle grid */}
          <div className="border rounded-lg overflow-x-auto" style={{ minWidth: 0 }}>
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
