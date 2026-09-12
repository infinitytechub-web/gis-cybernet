/**
 * Admin-only actions on an uploaded staff list file: Preview, Edit, Reject, Approve.
 *
 * Every action goes through a database routine that re-checks the administrator
 * role, validates the input and writes an audit entry, so the buttons here are
 * a convenience — never the security boundary.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Pencil, XCircle, CheckCircle2, Loader2, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCSVString } from "@/lib/download-utils";
import { csvCellQuoted } from "@/lib/csv-safe";
import { logAdminAudit } from "@/lib/admin-audit";

type ImportRecord = {
  id: string;
  file_name: string;
  status: string;
  approval_status: string | null;
  total_rows: number;
  target_org_unit_id: string | null;
  review_notes: string | null;
};

type RowRecord = {
  id: string;
  row_no: number;
  outcome: string;
  reason: string | null;
  payload: Record<string, string | null>;
};

const FIELDS: Array<{ key: string; label: string }> = [
  { key: "last_name", label: "Surname" },
  { key: "first_name", label: "First name" },
  { key: "rank", label: "Rank" },
  { key: "unit", label: "Unit" },
  { key: "shift", label: "Shift" },
  { key: "intake", label: "Intake" },
  { key: "region", label: "Region" },
  { key: "phone", label: "Phone" },
  { key: "gender", label: "Gender" },
];

export default function StaffListImportActions({ record }: { record: ImportRecord }) {
  const qc = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editRow, setEditRow] = useState<RowRecord | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [search, setSearch] = useState("");

  const committed = record.status === "committed";
  const rejected = record.approval_status === "rejected";
  const decidable = !committed && !rejected;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["staff-list-import-rows", record.id],
    enabled: previewOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_list_import_rows")
        .select("id, row_no, outcome, reason, payload")
        .eq("import_id", record.id)
        .order("row_no")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as RowRecord[];
    },
  });

  const openPreview = () => {
    setPreviewOpen(true);
    void logAdminAudit("staff_list_import", "previewed", { file: record.file_name }, record.id);
  };

  const startEdit = (row: RowRecord) => {
    setEditRow(row);
    const v: Record<string, string> = {};
    FIELDS.forEach((f) => { v[f.key] = String(row.payload?.[f.key] ?? ""); });
    setEditValues(v);
  };

  const saveRow = useMutation({
    mutationFn: async () => {
      if (!editRow) return;
      const payload: Record<string, string> = {};
      FIELDS.forEach((f) => { payload[f.key] = editValues[f.key]?.trim() ?? ""; });
      if (!payload.first_name || !payload.last_name) {
        throw new Error("First name and surname are both required");
      }
      const { error } = await supabase.rpc("staff_list_import_edit_row", {
        _row_id: editRow.id,
        _payload: payload as never,
        _outcome: "ready",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Row updated");
      setEditRow(null);
      qc.invalidateQueries({ queryKey: ["staff-list-import-rows", record.id] });
      qc.invalidateQueries({ queryKey: ["staff-list-imports"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save that row"),
  });

  const review = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      const { data, error } = await supabase.rpc("staff_list_import_review", {
        _import_id: record.id,
        _decision: decision,
        _notes: decision === "reject" ? rejectReason.trim() : null,
      });
      if (error) throw error;
      return { decision, out: data as any };
    },
    onSuccess: async ({ decision, out }) => {
      if (decision === "reject") {
        toast.success("File rejected");
        setRejectOpen(false);
        setRejectReason("");
      } else {
        toast.success(
          `Approved — ${out?.new ?? 0} added, ${out?.matched ?? 0} updated, ${out?.retired ?? 0} retired`,
        );
        const createdIds: string[] = (out?.created_profile_ids ?? []) as string[];
        if (createdIds.length) await createAccounts(createdIds);
      }
      ["staff-list-imports", "staff-list-import-people", "staff-list-import-units",
        "staff-list-import-ranks", "staff", "staff-roster"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ["staff-list-import-rows", record.id] });
    },
    onError: (e: any) => toast.error(e?.message || "That action could not be completed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("staff_list_import_delete", { _import_id: record.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Uploaded file deleted");
      setDeleteOpen(false);
      logAdminAudit({
        action: "staff_list_import_deleted",
        entityType: "staff_list_imports",
        entityId: record.id,
        details: { file_name: record.file_name },
      });
      qc.invalidateQueries({ queryKey: ["staff-list-imports"] });
    },
    onError: (e: any) => toast.error(e?.message || "That file could not be deleted"),
  });

  const createAccounts = async (ids: string[]) => {
    const creds: Array<{ staffId: string; name: string; username: string; password: string }> = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabase.functions.invoke("bulk-create-accounts", {
        body: { profile_ids: ids.slice(i, i + 150), role: "staff" },
      });
      if (error) {
        toast.error("Some accounts could not be created — retry from Staff Approvals");
        break;
      }
      creds.push(...(((data as any)?.created ?? []) as any[]));
    }
    if (creds.length) {
      const csv = [
        "Staff ID,Name,Sign-in email,Temporary password",
        ...creds.map((c) =>
          [c.staffId, c.name, `${c.username}@gis.local`, c.password].map(csvCellQuoted).join(",")),
      ].join("\n");
      downloadCSVString(csv, `staff-accounts-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`${creds.length} account(s) created — credential sheet downloaded`);
    }
  };

  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => FIELDS.some((f) =>
        String(r.payload?.[f.key] ?? "").toLowerCase().includes(q)))
    : rows;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="outline" size="sm" className="h-7 px-2" onClick={openPreview}>
        <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Preview
      </Button>
      <Button
        variant="outline" size="sm" className="h-7 px-2"
        disabled={!decidable}
        onClick={openPreview}
        title={decidable ? "Open the rows to edit" : "Committed or rejected files cannot be edited"}
      >
        <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Edit
      </Button>
      <Button
        variant="outline" size="sm"
        className="h-7 px-2 text-destructive hover:text-destructive"
        disabled={!decidable || review.isPending}
        onClick={() => setRejectOpen(true)}
      >
        <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Reject
      </Button>
      <Button
        size="sm" className="h-7 px-2"
        disabled={!decidable || review.isPending}
        onClick={() => review.mutate("approve")}
      >
        {review.isPending ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        )}
        Approve
      </Button>
      <Button
        variant="outline" size="sm"
        className="h-7 px-2 text-destructive hover:text-destructive"
        disabled={committed || remove.isPending}
        title={committed ? "Applied files are kept for the record" : "Delete this uploaded file"}
        onClick={() => setDeleteOpen(true)}
      >
        {remove.isPending ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        )}
        Delete
      </Button>

      {/* Preview & edit */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="!flex max-h-[90vh] max-w-5xl flex-col !overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-base">{record.file_name}</DialogTitle>
            <DialogDescription className="text-xs">
              {record.total_rows} row(s) · {record.status}
              {record.review_notes ? ` · ${record.review_notes}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="pl-9" placeholder="Search these rows" value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label="Search uploaded rows"
            />
          </div>
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading rows…
              </div>
            ) : (
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.slice(0, 500).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">{r.row_no}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm font-medium">
                        {r.payload?.last_name}, {r.payload?.first_name}
                      </TableCell>
                      <TableCell className="text-sm">{r.payload?.rank || "—"}</TableCell>
                      <TableCell className="text-sm">{r.payload?.unit || "—"}</TableCell>
                      <TableCell className="text-sm">{r.payload?.shift || "—"}</TableCell>
                      <TableCell className="text-sm">{r.payload?.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.outcome === "skipped" ? "destructive" : "outline"}
                          className="text-[10px]"
                        >
                          {r.reason ?? r.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="sm" className="h-7 px-2"
                          disabled={!decidable}
                          onClick={() => startEdit(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">Edit row {r.row_no}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {visible.length > 500 && (
              <p className="p-2 text-xs text-muted-foreground">
                Showing the first 500 of {visible.length} rows.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Row editor */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Edit row {editRow?.row_no}</DialogTitle>
            <DialogDescription className="text-xs">
              Corrections apply when the file is approved.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-3 overflow-auto sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`row-${f.key}`}>{f.label}</Label>
                <Input
                  id={`row-${f.key}`}
                  value={editValues[f.key] ?? ""}
                  onChange={(e) => setEditValues((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={() => saveRow.mutate()} disabled={saveRow.isPending}>
              {saveRow.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Save row
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Delete {record.file_name}?</DialogTitle>
            <DialogDescription className="text-xs">
              The file and its parsed rows are removed for good. Staff records are not touched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Delete file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Reject {record.file_name}</DialogTitle>
            <DialogDescription className="text-xs">
              Nothing is written to staff records. The reason is kept on the file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason" rows={3} value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this file being rejected?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || review.isPending}
              onClick={() => review.mutate("reject")}
            >
              {review.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Reject file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
