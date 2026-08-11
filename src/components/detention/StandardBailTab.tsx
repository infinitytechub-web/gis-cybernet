import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Eye, Gavel, Loader2, Pencil, Plus, Printer, Search, Trash2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { openPrintWindow } from "@/lib/safe-print";

type Bail = Record<string, any>;

const BAIL_TYPES = [
  { value: "self_recognizance", label: "Self recognizance" },
  { value: "cash", label: "Cash bail" },
  { value: "surety", label: "Surety bail" },
  { value: "property", label: "Property bond" },
];

const ID_TYPES = ["Ghana Card", "Passport", "Voter ID", "Driver's Licence", "Residence Permit", "Other"];

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  authorized: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  declined: "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
};

const blank = () => ({
  detention_id: "",
  bailee_first_name: "",
  bailee_last_name: "",
  bailee_gender: "",
  bailee_nationality: "",
  bailee_phone: "",
  bailee_address: "",
  bailee_id_type: "",
  bailee_id_number: "",
  offence: "",
  bail_type: "self_recognizance",
  bail_amount: "",
  currency: "GHS",
  conditions: "",
  report_station: "",
  report_back_at: "",
  surety_name: "",
  surety_relationship: "",
  surety_phone: "",
  surety_address: "",
  surety_occupation: "",
  surety_id_type: "",
  surety_id_number: "",
  authorization_status: "pending",
  authorization_remarks: "",
  authorized_by_name: "",
  authorized_by_rank: "",
  authorized_signature_name: "",
  notes: "",
  granted_at: new Date().toISOString().slice(0, 16),
});

const label = (v: string) => BAIL_TYPES.find((b) => b.value === v)?.label ?? v;
const fullName = (b: Bail) => `${b.bailee_first_name ?? ""} ${b.bailee_last_name ?? ""}`.trim();

/**
 * Standard Bail Form — create, view, edit, delete and print bail records.
 * Records may optionally be linked to a detainee in custody; when linked the
 * detainee's identity is pre-filled and the bail appears in their history.
 */
export function StandardBailTab({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Bail | null>(null);
  const [viewing, setViewing] = useState<Bail | null>(null);
  const [deleting, setDeleting] = useState<Bail | null>(null);
  const [form, setForm] = useState<Record<string, any>>(blank());

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["detention-bail-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("detention_bail_records")
        .select("*")
        .order("granted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: detainees = [] } = useQuery({
    queryKey: ["detention-bail-detainees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("detention_records")
        .select("id, first_name, last_name, nationality, gender, phone, offence_description, status")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r: Bail) =>
      fullName(r).toLowerCase().includes(q) ||
      String(r.reference ?? "").toLowerCase().includes(q) ||
      String(r.surety_name ?? "").toLowerCase().includes(q) ||
      String(r.offence ?? "").toLowerCase().includes(q));
  }, [records, query]);

  const openCreate = () => { setEditing(null); setForm(blank()); setFormOpen(true); };
  const openEdit = (r: Bail) => {
    setEditing(r);
    setForm({
      ...blank(),
      ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ""])),
      granted_at: r.granted_at ? new Date(r.granted_at).toISOString().slice(0, 16) : "",
      report_back_at: r.report_back_at ? new Date(r.report_back_at).toISOString().slice(0, 16) : "",
    });
    setFormOpen(true);
  };

  const linkDetainee = (id: string) => {
    set("detention_id", id === "none" ? "" : id);
    const d: any = detainees.find((x: any) => x.id === id);
    if (!d) return;
    setForm((f) => ({
      ...f,
      detention_id: id,
      bailee_first_name: d.first_name ?? f.bailee_first_name,
      bailee_last_name: d.last_name ?? f.bailee_last_name,
      bailee_nationality: d.nationality ?? f.bailee_nationality,
      bailee_gender: d.gender ?? f.bailee_gender,
      bailee_phone: d.phone ?? f.bailee_phone,
      offence: d.offence_description ?? f.offence,
    }));
  };

  const payload = () => {
    const numeric = form.bail_amount === "" || form.bail_amount === null ? null : Number(form.bail_amount);
    const clean = (v: any) => (v === "" ? null : v);
    return {
      detention_id: clean(form.detention_id),
      bailee_first_name: String(form.bailee_first_name).trim(),
      bailee_last_name: String(form.bailee_last_name).trim(),
      bailee_gender: clean(form.bailee_gender),
      bailee_nationality: clean(form.bailee_nationality),
      bailee_phone: clean(form.bailee_phone),
      bailee_address: clean(form.bailee_address),
      bailee_id_type: clean(form.bailee_id_type),
      bailee_id_number: clean(form.bailee_id_number),
      offence: String(form.offence).trim(),
      bail_type: form.bail_type,
      bail_amount: numeric,
      currency: form.currency || "GHS",
      conditions: clean(form.conditions),
      report_station: clean(form.report_station),
      report_back_at: form.report_back_at ? new Date(form.report_back_at).toISOString() : null,
      surety_name: clean(form.surety_name),
      surety_relationship: clean(form.surety_relationship),
      surety_phone: clean(form.surety_phone),
      surety_address: clean(form.surety_address),
      surety_occupation: clean(form.surety_occupation),
      surety_id_type: clean(form.surety_id_type),
      surety_id_number: clean(form.surety_id_number),
      authorization_status: form.authorization_status || "pending",
      authorization_remarks: clean(form.authorization_remarks),
      authorized_by_name: clean(form.authorized_by_name),
      authorized_by_rank: clean(form.authorized_by_rank),
      authorized_signature_name: clean(form.authorized_signature_name),
      notes: clean(form.notes),
      granted_at: form.granted_at ? new Date(form.granted_at).toISOString() : new Date().toISOString(),
    };
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = payload();
      if (!body.bailee_first_name || !body.bailee_last_name) throw new Error("Bailee first and last name are required");
      if (!body.offence) throw new Error("Offence is required");
      if (editing) {
        const { error } = await supabase.from("detention_bail_records").update(body).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("detention_bail_records")
          .insert({ ...body, created_by: user!.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["detention-bail-records"] });
      toast.success(editing ? "Bail record updated" : "Bail record created");
      setFormOpen(false); setEditing(null); setForm(blank());
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save bail record"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("detention_bail_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["detention-bail-records"] });
      toast.success("Bail record deleted");
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete bail record"),
  });

  const printRecord = (r: Bail) => {
    const row = (k: string, v: any) =>
      `<tr><th style="text-align:left;padding:4px 10px 4px 0;width:220px;vertical-align:top">${k}</th><td style="padding:4px 0">${v ?? "—"}</td></tr>`;
    const html = `
      <h1 style="font-size:18px;margin:0 0 2px">STANDARD BAIL FORM</h1>
      <p style="margin:0 0 14px;font-size:12px">Reference: ${r.reference ?? "—"} · Granted: ${r.granted_at ? format(new Date(r.granted_at), "dd MMM yyyy HH:mm") : "—"}</p>
      <h2 style="font-size:13px;margin:12px 0 4px">Bailee</h2>
      <table style="font-size:12px;width:100%">
        ${row("Name", fullName(r))}
        ${row("Gender / Nationality", `${r.bailee_gender ?? "—"} / ${r.bailee_nationality ?? "—"}`)}
        ${row("Phone", r.bailee_phone)}
        ${row("Address", r.bailee_address)}
        ${row("Identification", `${r.bailee_id_type ?? "—"} ${r.bailee_id_number ?? ""}`)}
        ${row("Offence", r.offence)}
      </table>
      <h2 style="font-size:13px;margin:12px 0 4px">Bail terms</h2>
      <table style="font-size:12px;width:100%">
        ${row("Type", label(r.bail_type))}
        ${row("Amount", r.bail_amount ? `${r.currency ?? "GHS"} ${Number(r.bail_amount).toLocaleString()}` : "—")}
        ${row("Conditions", r.conditions)}
        ${row("Report station", r.report_station)}
        ${row("Report back", r.report_back_at ? format(new Date(r.report_back_at), "dd MMM yyyy HH:mm") : "—")}
      </table>
      <h2 style="font-size:13px;margin:12px 0 4px">Surety</h2>
      <table style="font-size:12px;width:100%">
        ${row("Name", r.surety_name)}
        ${row("Relationship / Occupation", `${r.surety_relationship ?? "—"} / ${r.surety_occupation ?? "—"}`)}
        ${row("Phone", r.surety_phone)}
        ${row("Address", r.surety_address)}
        ${row("Identification", `${r.surety_id_type ?? "—"} ${r.surety_id_number ?? ""}`)}
      </table>
      <h2 style="font-size:13px;margin:12px 0 4px">Authorization</h2>
      <table style="font-size:12px;width:100%">
        ${row("Status", String(r.authorization_status ?? "pending").toUpperCase())}
        ${row("Officer", `${r.authorized_by_rank ?? ""} ${r.authorized_by_name ?? "—"}`)}
        ${row("Remarks", r.authorization_remarks)}
        ${row("Notes", r.notes)}
      </table>
      <div style="margin-top:36px;font-size:12px;display:flex;gap:60px">
        <div>_____________________________<br/>Bailee signature</div>
        <div>_____________________________<br/>Authorizing officer${r.authorized_signature_name ? ` (${r.authorized_signature_name})` : ""}</div>
      </div>
      <p style="margin-top:28px;font-size:10px;text-align:center">CONFIDENTIAL — Cybernet HRM System</p>
    `;
    openPrintWindow(`<!doctype html><html><head><meta charset="utf-8"><title>Standard Bail Form — ${fullName(r)}</title>
      <style>body{font-family:system-ui,Arial,sans-serif;padding:28px;color:#111}h2{border-bottom:1px solid #ccc;padding-bottom:2px}</style>
      </head><body>${html}</body></html>`);
  };

  return (
    <Card className="mt-3">
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gavel className="h-4 w-4 text-cyan-700 dark:text-cyan-400" /> Standard Bail Forms ({records.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 w-56" placeholder="Search name, reference, surety…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {canEdit && (
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New bail form
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading bail records…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No bail records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Bailee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Granted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: Bail) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.reference ?? "—"}</TableCell>
                      <TableCell className="font-medium">
                        {fullName(r)}
                        {r.detention_id && <Badge variant="outline" className="ml-2 text-[10px]">Linked</Badge>}
                      </TableCell>
                      <TableCell>{label(r.bail_type)}</TableCell>
                      <TableCell>{r.bail_amount ? `${r.currency ?? "GHS"} ${Number(r.bail_amount).toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.granted_at ? format(new Date(r.granted_at), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLE[r.authorization_status] ?? ""} variant="secondary">
                          {String(r.authorization_status ?? "pending")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" title="View" onClick={() => setViewing(r)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Print" onClick={() => printRecord(r)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="icon" variant="ghost" title="Delete" onClick={() => setDeleting(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>

      {/* Create / edit */}
      <Dialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit bail record" : "New standard bail form"}</DialogTitle>
            <DialogDescription>
              Optionally link the form to a detainee in custody to pre-fill their particulars.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[65vh] pr-3">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Linked detainee (optional)</Label>
                <Select value={form.detention_id || "none"} onValueChange={linkDetainee}>
                  <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked (standalone bail)</SelectItem>
                    {detainees.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim()} · {d.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Bailee particulars</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="First name *" value={form.bailee_first_name} onChange={(v) => set("bailee_first_name", v)} />
                  <Field label="Last name *" value={form.bailee_last_name} onChange={(v) => set("bailee_last_name", v)} />
                  <Field label="Gender" value={form.bailee_gender} onChange={(v) => set("bailee_gender", v)} />
                  <Field label="Nationality" value={form.bailee_nationality} onChange={(v) => set("bailee_nationality", v)} />
                  <Field label="Phone" value={form.bailee_phone} onChange={(v) => set("bailee_phone", v)} />
                  <Field label="Address" value={form.bailee_address} onChange={(v) => set("bailee_address", v)} />
                  <div className="space-y-2">
                    <Label>ID type</Label>
                    <Select value={form.bailee_id_type || "none"} onValueChange={(v) => set("bailee_id_type", v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Field label="ID number" value={form.bailee_id_number} onChange={(v) => set("bailee_id_number", v)} />
                </div>
                <div className="space-y-2">
                  <Label>Offence *</Label>
                  <Textarea rows={2} value={form.offence} onChange={(e) => set("offence", e.target.value)} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Bail terms</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Bail type</Label>
                    <Select value={form.bail_type} onValueChange={(v) => set("bail_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BAIL_TYPES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Input value={form.currency} maxLength={5} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Amount</Label>
                      <Input type="number" min="0" step="0.01" value={form.bail_amount} onChange={(e) => set("bail_amount", e.target.value)} />
                    </div>
                  </div>
                  <Field label="Report station" value={form.report_station} onChange={(v) => set("report_station", v)} />
                  <div className="space-y-2">
                    <Label>Report back on</Label>
                    <Input type="datetime-local" value={form.report_back_at} onChange={(e) => set("report_back_at", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Granted at</Label>
                    <Input type="datetime-local" value={form.granted_at} onChange={(e) => set("granted_at", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Conditions</Label>
                  <Textarea rows={2} value={form.conditions} onChange={(e) => set("conditions", e.target.value)} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Surety</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name" value={form.surety_name} onChange={(v) => set("surety_name", v)} />
                  <Field label="Relationship to bailee" value={form.surety_relationship} onChange={(v) => set("surety_relationship", v)} />
                  <Field label="Phone" value={form.surety_phone} onChange={(v) => set("surety_phone", v)} />
                  <Field label="Occupation" value={form.surety_occupation} onChange={(v) => set("surety_occupation", v)} />
                  <Field label="Address" value={form.surety_address} onChange={(v) => set("surety_address", v)} />
                  <div className="space-y-2">
                    <Label>ID type</Label>
                    <Select value={form.surety_id_type || "none"} onValueChange={(v) => set("surety_id_type", v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Field label="ID number" value={form.surety_id_number} onChange={(v) => set("surety_id_number", v)} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Authorization</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.authorization_status} onValueChange={(v) => set("authorization_status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="authorized">Authorized</SelectItem>
                        <SelectItem value="declined">Declined</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Field label="Authorizing officer" value={form.authorized_by_name} onChange={(v) => set("authorized_by_name", v)} />
                  <Field label="Officer rank / position" value={form.authorized_by_rank} onChange={(v) => set("authorized_by_rank", v)} />
                  <Field label="Signature name" value={form.authorized_signature_name} onChange={(v) => set("authorized_signature_name", v)} />
                </div>
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea rows={2} value={form.authorization_remarks} onChange={(e) => set("authorization_remarks", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Internal notes</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
              </section>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button className="gap-2" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create bail form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bail record — {viewing ? fullName(viewing) : ""}</DialogTitle>
            <DialogDescription>{viewing?.reference ?? "No reference"}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <ScrollArea className="max-h-[60vh] pr-3">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
                <Detail k="Bail type" v={label(viewing.bail_type)} />
                <Detail k="Amount" v={viewing.bail_amount ? `${viewing.currency ?? "GHS"} ${Number(viewing.bail_amount).toLocaleString()}` : "—"} />
                <Detail k="Granted at" v={viewing.granted_at ? format(new Date(viewing.granted_at), "dd MMM yyyy HH:mm") : "—"} />
                <Detail k="Status" v={String(viewing.authorization_status ?? "pending")} />
                <Detail k="Gender" v={viewing.bailee_gender} />
                <Detail k="Nationality" v={viewing.bailee_nationality} />
                <Detail k="Phone" v={viewing.bailee_phone} />
                <Detail k="Address" v={viewing.bailee_address} />
                <Detail k="Identification" v={`${viewing.bailee_id_type ?? "—"} ${viewing.bailee_id_number ?? ""}`} />
                <Detail k="Offence" v={viewing.offence} />
                <Detail k="Conditions" v={viewing.conditions} />
                <Detail k="Report station" v={viewing.report_station} />
                <Detail k="Report back" v={viewing.report_back_at ? format(new Date(viewing.report_back_at), "dd MMM yyyy HH:mm") : "—"} />
                <Detail k="Surety" v={viewing.surety_name} />
                <Detail k="Surety phone" v={viewing.surety_phone} />
                <Detail k="Surety relationship" v={viewing.surety_relationship} />
                <Detail k="Authorizing officer" v={`${viewing.authorized_by_rank ?? ""} ${viewing.authorized_by_name ?? "—"}`} />
                <Detail k="Remarks" v={viewing.authorization_remarks} />
                <Detail k="Notes" v={viewing.notes} />
              </dl>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" className="gap-1.5" onClick={() => viewing && printRecord(viewing)}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bail record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `${fullName(deleting)} — ${deleting.reference ?? "no reference"}. ` : ""}
              This permanently removes the bail form. The action is captured in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Field({ label: l, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{l}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Detail({ k, v }: { k: string; v: any }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="break-words">{v || "—"}</dd>
    </div>
  );
}
