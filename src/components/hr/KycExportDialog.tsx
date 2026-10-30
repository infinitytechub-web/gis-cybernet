import { useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { downloadBlob } from "@/lib/download-utils";
import { formatDate } from "@/lib/date-format";
import { KYC_FIELDS, KYC_GROUPS, buildKycRows } from "@/lib/hrm-kyc-export";

type Props = {
  /** Profile IDs in the current view (filtered list or command). */
  profileIds: string[];
  /** Optional ticked rows; offered as a scope when non-empty. */
  selectedIds?: string[];
  scopeLabel: string;
};

const DEFAULT = ["staff_id", "last_name", "first_name", "gender", "rank", "command", "intake", "status"];

export function KycExportDialog({ profileIds, selectedIds = [], scopeLabel }: Props) {
  const { role, isAdmin, isAdminOrSupervisor } = useAuth();
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<string[]>(DEFAULT);
  const [fmt, setFmt] = useState<"xlsx" | "csv" | "pdf">("xlsx");
  const [scope, setScope] = useState<"view" | "selected">("view");
  const [busy, setBusy] = useState(false);
  if (!isAdminOrSupervisor) return null;
  const canSeeRestricted = isAdmin || role === "oic" || role === "2ic";

  const toggle = (k: string) => setKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const toggleGroup = (g: string, on: boolean) => {
    const gk = KYC_FIELDS.filter((f) => f.group === g).map((f) => f.key);
    setKeys((ks) => (on ? Array.from(new Set([...ks, ...gk])) : ks.filter((k) => !gk.includes(k))));
  };

  const run = async () => {
    const ids = scope === "selected" && selectedIds.length ? selectedIds : profileIds;
    if (!ids.length || !keys.length) { toast.error("Choose at least one staff member and one field."); return; }
    setBusy(true);
    try {
      const out: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*, ranks(name), departments(name), org_units(name)")
          .in("id", ids.slice(i, i + 200));
        if (error) throw error;
        out.push(...(data ?? []));
      }
      const needSR = keys.some((k) => ["appointments", "promotions", "exits"].includes(k));
      const sr: Record<string, { a: string[]; p: string[]; e: string[] }> = {};
      if (needSR) {
        const pids = out.map((p) => p.id);
        const [a, p, e] = await Promise.all([
          supabase.from("staff_appointments").select("profile_id,position_title,start_date").in("profile_id", pids),
          supabase.from("staff_promotions").select("profile_id,effective_date,status,to_rank:ranks!staff_promotions_to_rank_id_fkey(name)").in("profile_id", pids),
          supabase.from("staff_exits").select("profile_id,exit_type,effective_date,status").in("profile_id", pids),
        ]);
        const get = (id: string) => (sr[id] ??= { a: [], p: [], e: [] });
        (a.data ?? []).forEach((r: any) => get(r.profile_id).a.push(`${r.position_title} (${formatDate(r.start_date)})`));
        (p.data ?? []).forEach((r: any) => get(r.profile_id).p.push(`${r.to_rank?.name ?? "?"} ${formatDate(r.effective_date)} [${r.status}]`));
        (e.data ?? []).forEach((r: any) => get(r.profile_id).e.push(`${r.exit_type} ${formatDate(r.effective_date)} [${r.status}]`));
      }
      const flat = out
        .sort((x, y) => String(x.last_name).localeCompare(String(y.last_name)))
        .map((p) => ({
          ...p,
          rank: p.ranks?.name, department: p.departments?.name, command: p.org_units?.name,
          appointments: sr[p.id]?.a, promotions: sr[p.id]?.p, exits: sr[p.id]?.e,
        }));
      const ordered = KYC_FIELDS.map((f) => f.key).filter((k) => keys.includes(k));
      const { headers, rows } = buildKycRows(flat, ordered, canSeeRestricted);
      const stamp = new Date().toISOString().slice(0, 10);
      const name = `staff_kyc_${stamp}`;

      const { error: logErr } = await (supabase.rpc as any)("log_kyc_export", {
        _format: fmt, _row_count: rows.length, _fields: ordered, _scope: scopeLabel,
      });
      if (logErr) throw logErr;

      if (fmt === "csv") {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
        downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
      } else if (fmt === "xlsx") {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Staff KYC");
        const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`);
      } else {
        const doc = new jsPDF({ unit: "mm", format: "a4" });
        rows.forEach((r, i) => {
          if (i) doc.addPage();
          doc.setFontSize(13).text("Personnel Bio-Data — KYC Profile", 14, 16);
          doc.setFontSize(8).text(`${scopeLabel} · Generated ${formatDate(new Date())} · CONFIDENTIAL`, 14, 22);
          autoTable(doc, { startY: 27, head: [["Field", "Value"]], body: headers.map((h, j) => [h, r[j] || "—"]), styles: { fontSize: 9 }, columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } } });
        });
        downloadBlob(doc.output("blob"), `${name}.pdf`);
      }
      toast.success(`Exported ${rows.length} staff profiles.`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1"><FileDown className="h-4 w-4" aria-hidden="true" /> Export profiles</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export staff profiles (KYC)</DialogTitle>
          <DialogDescription>
            Choose the details to include. {canSeeRestricted ? "" : "Sensitive details are masked for your role. "}Every export is logged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Staff</p>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as any)} className="flex flex-wrap gap-4">
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="view" /> {scopeLabel} ({profileIds.length})</Label>
              {selectedIds.length > 0 && (
                <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="selected" /> Selected rows ({selectedIds.length})</Label>
              )}
            </RadioGroup>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {KYC_GROUPS.map((g) => {
              const gf = KYC_FIELDS.filter((f) => f.group === g);
              const all = gf.every((f) => keys.includes(f.key));
              return (
                <fieldset key={g} className="rounded-md border p-3">
                  <legend className="px-1 text-sm font-semibold">
                    <Label className="flex items-center gap-2"><Checkbox checked={all} onCheckedChange={(v) => toggleGroup(g, !!v)} /> {g}</Label>
                  </legend>
                  <div className="mt-1 space-y-1">
                    {gf.map((f) => (
                      <Label key={f.key} className="flex items-center gap-2 text-sm font-normal">
                        <Checkbox checked={keys.includes(f.key)} onCheckedChange={() => toggle(f.key)} /> {f.label}
                        {f.restricted && !canSeeRestricted && <span className="text-xs text-muted-foreground">(masked)</span>}
                      </Label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Format</p>
            <RadioGroup value={fmt} onValueChange={(v) => setFmt(v as any)} className="flex flex-wrap gap-4">
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="xlsx" /> Excel</Label>
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="csv" /> CSV</Label>
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="pdf" /> PDF (one sheet per officer)</Label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={run} disabled={busy || !keys.length}>{busy ? "Preparing…" : `Download ${keys.length} fields`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
