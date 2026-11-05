import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { readRecordPages } from "@/lib/read-record-pages";
import { validateStaffApplication } from "@/lib/staff-applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StaffCombobox, type StaffOption } from "@/components/ui/staff-combobox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function StaffApplicationForm({ open, onOpenChange, onSubmitted }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSubmitted: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [profile, setProfile] = useState("");
  const [type, setType] = useState("position");
  const [position, setPosition] = useState("");
  const [unit, setUnit] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const staff = useQuery({
    queryKey: ["application-staff-picker"], enabled: open,
    queryFn: () => readRecordPages<StaffOption>((from, to) => supabase.from("profiles")
      .select("id,first_name,last_name,staff_id").is("deleted_at", null).order("last_name").order("id").range(from, to)),
  });
  const units = useQuery({
    queryKey: ["org-units-active-names"], enabled: open,
    queryFn: () => readRecordPages<{ id: string; name: string }>((from, to) => supabase.from("org_units")
      .select("id,name").eq("is_active", true).order("name").order("id").range(from, to)),
  });
  const submit = async () => {
    const problem = validateStaffApplication({ profile, type, position, unit, statement });
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      const { data, error: failure } = await supabase.rpc("record_staff_application", {
        _profile_id: profile, _type: type, _position_title: position.trim() || null,
        _target_org_unit_id: unit || null, _statement: statement.trim(),
      });
      if (failure) throw failure;
      if (!data) throw new Error("The saved application could not be confirmed.");
      for (const key of ["staff-applications", "my-staff-applications", "admin-overview"]) void qc.invalidateQueries({ queryKey: [key] });
      toast.success("Application submitted for review.");
      onOpenChange(false); onSubmitted(data);
    } catch (failure: any) { setError(failure.message || "Submission failed. Please retry."); }
    finally { setBusy(false); }
  };
  const failed = staff.isError || units.isError;
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Submit staff application</DialogTitle><DialogDescription>Position or posting application</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {failed && <Alert variant="destructive"><AlertDescription>Staff or commands could not be loaded. <Button type="button" variant="outline" size="sm" onClick={() => { void staff.refetch(); void units.refetch(); }}>Retry</Button></AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
        <div className="space-y-1"><Label>Staff member</Label><StaffCombobox staff={staff.data ?? []} value={profile} onValueChange={setProfile} disabled={busy || staff.isLoading || failed} /></div>
        <div className="space-y-1"><Label htmlFor="application-kind">Application type</Label><Select value={type} onValueChange={setType} disabled={busy}><SelectTrigger id="application-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="position">Position</SelectItem><SelectItem value="posting">Posting</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="application-position">Position {type === "posting" ? "(optional)" : "*"}</Label><Input id="application-position" value={position} onChange={(event) => setPosition(event.target.value)} disabled={busy} /></div>
        <div className="space-y-1"><Label>Destination command / unit {type === "posting" ? "*" : "(optional)"}</Label><SearchableSelect options={[{ value: "", label: "No destination selected" }, ...(units.data ?? []).map((u) => ({ value: u.id, label: u.name }))]} value={unit} onValueChange={setUnit} placeholder="Select destination" disabled={busy || units.isLoading || failed} /></div>
        <div className="space-y-1"><Label htmlFor="application-statement">Application statement *</Label><Textarea id="application-statement" value={statement} onChange={(event) => setStatement(event.target.value)} rows={5} disabled={busy} /><p className="text-xs text-muted-foreground">{statement.trim().length} / 20 minimum characters</p></div>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy || failed || staff.isLoading || units.isLoading}>{busy ? "Submitting…" : "Submit application"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}