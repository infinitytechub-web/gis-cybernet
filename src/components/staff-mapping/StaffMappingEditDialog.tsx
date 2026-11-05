import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type OrgUnit } from "@/lib/org-hierarchy";
import { DASHBOARD_QUERY_KEYS } from "@/lib/dashboard-integrity";
import { CommandPicker } from "@/components/org/CommandPicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function StaffMappingEditDialog({ record, onClose }: {
  record: { profile_id: string; full_name: string | null; org_unit_name: string | null };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [destination, setDestination] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const context = useQuery({
    queryKey: ["staff-mapping-edit", record.profile_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_mapping_edit_context", { _profile_id: record.profile_id });
      if (error) throw error;
      return data as unknown as { org_unit_id: string | null; destinations: OrgUnit[] };
    }, retry: false,
  });
  const target = destination ?? context.data?.org_unit_id ?? null;
  const save = async () => {
    if (!context.data || !target || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      const { data, error } = await supabase.rpc("save_staff_mapping", { _profile_id: record.profile_id,
        _expected_org_unit_id: context.data.org_unit_id, _to_org_unit_id: target, _reason: reason.trim() });
      if (error) throw error;
      if (data !== target) throw new Error("Saved assignment could not be confirmed.");
      await Promise.all([...DASHBOARD_QUERY_KEYS, "command-assignments", "org-scope", "staff-profile", "staff-mapping-edit", "my-directory-level"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
      toast.success("Command / unit saved; dashboard totals refreshed.");
      onClose();
    } catch (failure: any) { setError(failure.message || "Assignment could not be saved. Please retry."); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Edit command / unit</DialogTitle><DialogDescription>{record.full_name}</DialogDescription></DialogHeader>
    <p className="text-sm"><span className="text-muted-foreground">Current posting: </span>{record.org_unit_name || "Unassigned"}</p>
    {context.isLoading && <p role="status">Loading authorised destinations…</p>}
    {context.isError && <Alert variant="destructive"><AlertDescription>Assignment could not be loaded or is outside your authority. <Button variant="outline" size="sm" onClick={() => void context.refetch()}>Retry</Button></AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" size="sm" onClick={() => { setDestination(null); void context.refetch(); }}>Reload assignment</Button></AlertDescription></Alert>}
    {context.data && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="space-y-1"><Label htmlFor="mapping-destination">Command / unit *</Label><CommandPicker id="mapping-destination" units={context.data.destinations} value={target} onChange={setDestination} allowAll={false} placeholder="Choose command or unit" disabled={busy} /></div>
      <div className="space-y-1"><Label htmlFor="mapping-reason">Assignment reason *</Label><Textarea id="mapping-reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} required /></div>
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !target || !reason.trim() || target === context.data.org_unit_id}>{busy ? "Saving…" : "Save assignment"}</Button></DialogFooter>
    </form>}
  </DialogContent></Dialog>;
}