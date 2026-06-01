import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, UserPlus, GitMerge, XCircle, Loader2, X, Trash2, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { useBulkSelection } from "@/hooks/useBulkSelection";

export default function PendingStaffApprovals() {
  const { user, isAdminOrSupervisor, loading } = useAuthContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState<any | null>(null);

  const matches = useQuery({
    queryKey: ["pending-staff-matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_staff_matches")
        .select("id, import_id, rank_text, name_text, serial_no, shift, gender, unit, status, matched_profile_id, created_profile_id, created_at, resolved_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && isAdminOrSupervisor,
  });

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminOrSupervisor) return <Navigate to="/dashboard" replace />;

  const pending = (matches.data ?? []).filter((m: any) => m.status === "pending");
  const merged = (matches.data ?? []).filter((m: any) => m.status === "merged");
  const approved = (matches.data ?? []).filter((m: any) => m.status === "approved");

  const reject = async (m: any) => {
    if (!confirm(`Reject ${m.name_text}? The auto-created profile will be removed.`)) return;
    if (m.created_profile_id) {
      await supabase.from("profiles").delete().eq("id", m.created_profile_id);
    }
    const { error } = await supabase
      .from("pending_staff_matches")
      .update({ status: "rejected", resolved_at: new Date().toISOString(), resolved_by: user.id })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    qc.invalidateQueries({ queryKey: ["pending-staff-matches"] });
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Pending Staff Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          Confirm rank/department for personnel auto-created from roster imports, or merge them with an existing staff record.
        </p>
      </div>

      <SectionCard title={`Awaiting approval (${pending.length})`} desc="New names from the roster that did not match an existing staff record." rows={pending} onApprove={(m) => setOpen({ kind: "approve", row: m })} onMerge={(m) => setOpen({ kind: "merge", row: m })} onReject={reject} />
      <SectionCard title={`Recently merged (${merged.length})`} desc="Names that were auto-matched to existing staff and had their shift updated." rows={merged.slice(0, 50)} muted />
      <SectionCard title={`Approved (${approved.length})`} desc="Approved auto-created profiles." rows={approved.slice(0, 50)} muted />

      {open && (
        <ResolveDialog
          row={open.row}
          mode={open.kind}
          onClose={() => setOpen(null)}
          onDone={() => { setOpen(null); qc.invalidateQueries({ queryKey: ["pending-staff-matches"] }); }}
        />
      )}
    </div>
  );
}

function SectionCard({ title, desc, rows, onApprove, onMerge, onReject, muted }: any) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">S/N</TableHead>
                <TableHead>Rank (text)</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-16">Shift</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                {!muted && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={muted ? 6 : 7} className="text-center py-6 text-muted-foreground">Nothing to show</TableCell></TableRow>
              ) : rows.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.serial_no}</TableCell>
                  <TableCell className="text-xs">{m.rank_text}</TableCell>
                  <TableCell className="text-xs font-medium">{m.name_text}</TableCell>
                  <TableCell className="text-xs">{m.shift}</TableCell>
                  <TableCell className="text-xs">{m.unit ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.status === "pending" ? "outline" : m.status === "rejected" ? "destructive" : "default"} className="text-[10px]">
                      {m.status}
                    </Badge>
                  </TableCell>
                  {!muted && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="default" onClick={() => onApprove(m)}>
                          <UserPlus className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onMerge(m)}>
                          <GitMerge className="h-3.5 w-3.5 mr-1" /> Merge
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onReject(m)}>
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ResolveDialog({ row, mode, onClose, onDone }: { row: any; mode: "approve" | "merge"; onClose: () => void; onDone: () => void }) {
  const { user } = useAuthContext();
  const [rankId, setRankId] = useState<string>("");
  const [deptId, setDeptId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [mergeProfileId, setMergeProfileId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const ranks = useQuery({
    queryKey: ["ranks-all"],
    queryFn: async () => (await supabase.from("ranks").select("id, name").order("name")).data ?? [],
  });
  const depts = useQuery({
    queryKey: ["depts-all"],
    queryFn: async () => (await supabase.from("departments").select("id, name").order("name")).data ?? [],
  });
  const profiles = useQuery({
    queryKey: ["profiles-merge", row.id],
    queryFn: async () => (await supabase.from("profiles").select("id, staff_id, first_name, last_name").order("last_name").limit(1000)).data ?? [],
    enabled: mode === "merge",
  });

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "approve") {
        if (!row.created_profile_id) throw new Error("No auto-created profile to update");
        const update: any = { login_enabled: true };
        if (rankId) update.rank_id = rankId;
        if (deptId) update.department_id = deptId;
        if (staffId.trim()) update.staff_id = staffId.trim();
        const { error: e1 } = await supabase.from("profiles").update(update).eq("id", row.created_profile_id);
        if (e1) throw e1;
        const { error: e2 } = await supabase
          .from("pending_staff_matches")
          .update({ status: "approved", resolved_at: new Date().toISOString(), resolved_by: user!.id })
          .eq("id", row.id);
        if (e2) throw e2;
        toast.success("Profile approved & activated");
      } else {
        if (!mergeProfileId) throw new Error("Select a target profile");
        // Update target shift, delete the auto stub
        const { error: e1 } = await supabase
          .from("profiles")
          .update({ shift_group: row.shift, unit: row.unit ?? undefined })
          .eq("id", mergeProfileId);
        if (e1) throw e1;
        if (row.created_profile_id) {
          await supabase.from("profiles").delete().eq("id", row.created_profile_id);
        }
        const { error: e2 } = await supabase
          .from("pending_staff_matches")
          .update({
            status: "merged",
            matched_profile_id: mergeProfileId,
            created_profile_id: null,
            resolved_at: new Date().toISOString(),
            resolved_by: user!.id,
          })
          .eq("id", row.id);
        if (e2) throw e2;
        toast.success("Merged with existing profile");
      }
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "approve" ? "Approve new staff" : "Merge with existing staff"}</DialogTitle>
          <DialogDescription>
            {row.rank_text} <strong>{row.name_text}</strong> · Shift {row.shift} · S/N {row.serial_no}
          </DialogDescription>
        </DialogHeader>
        {mode === "approve" ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Permanent staff ID (optional)</Label>
              <Input value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="leave blank to keep auto-generated" />
            </div>
            <div>
              <Label className="text-xs">Rank</Label>
              <Select value={rankId} onValueChange={setRankId}>
                <SelectTrigger><SelectValue placeholder="Select rank…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {(ranks.data ?? []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger><SelectValue placeholder="Select department…" /></SelectTrigger>
                <SelectContent>
                  {(depts.data ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label className="text-xs">Merge into existing profile</Label>
            <Select value={mergeProfileId} onValueChange={setMergeProfileId}>
              <SelectTrigger><SelectValue placeholder="Select existing staff…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(profiles.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.last_name} {p.first_name} ({p.staff_id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
