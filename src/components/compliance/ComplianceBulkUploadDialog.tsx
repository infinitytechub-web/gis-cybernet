import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { isPast } from "date-fns";
import { validateComplianceFile, COMPLIANCE_MAX_BYTES } from "@/lib/compliance-file-validator";

const BUCKET = "staff-documents";
const DOC_TYPES = ["Passport", "National ID", "Service ID", "Visa", "Work Permit", "Driver's License", "Medical Certificate", "Other"];

type Kind = "documents" | "certifications";

interface Row {
  id: string;
  file: File;
  cleanName: string;
  ext: string;
  size: number;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: Kind;
  isAdmin: boolean;
  ownProfileId: string | null;
  profiles: Array<{ id: string; first_name: string; last_name: string; staff_id: string }>;
}

export function ComplianceBulkUploadDialog({ open, onOpenChange, kind, isAdmin, ownProfileId, profiles }: Props) {
  const qc = useQueryClient();
  const [profileId, setProfileId] = useState("");
  const [docType, setDocType] = useState(""); // documents only
  const [certName, setCertName] = useState(""); // certifications only
  const [issuingBody, setIssuingBody] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (open) {
      setProfileId(isAdmin ? "" : (ownProfileId ?? ""));
      setDocType("");
      setCertName("");
      setIssuingBody("");
      setExpiryDate("");
      setRows([]);
      setProgress(0);
    }
  }, [open, isAdmin, ownProfileId]);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    if (rows.length + files.length > 25) {
      toast.error("Max 25 files per batch");
      return;
    }
    const validated: Row[] = await Promise.all(
      files.map(async (f) => {
        const res = await validateComplianceFile(f);
        if (res.ok) {
          return {
            id: crypto.randomUUID(),
            file: res.file,
            cleanName: res.cleanName,
            ext: res.ext,
            size: f.size,
            status: "pending" as const,
          };
        }
        return {
          id: crypto.randomUUID(),
          file: f,
          cleanName: f.name,
          ext: "",
          size: f.size,
          status: "error" as const,
          message: res.reason,
        };
      }),
    );
    setRows((prev) => [...prev, ...validated]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const canStart =
    !running &&
    profileId &&
    rows.some((r) => r.status === "pending") &&
    (kind === "documents" ? !!docType : !!certName);

  async function startUpload() {
    if (!canStart) return;
    if (!isAdmin && profileId !== ownProfileId) {
      toast.error("You can only upload to your own profile");
      return;
    }
    setRunning(true);
    setProgress(0);
    const { data: { user } } = await supabase.auth.getUser();
    const queue = rows.filter((r) => r.status === "pending");
    let done = 0;
    let okCount = 0;
    let failCount = 0;

    for (const row of queue) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "uploading" } : r)));
      try {
        const path = `${profileId}/${kind}/${Date.now()}-${crypto.randomUUID()}.${row.ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, row.file, {
          contentType: row.file.type || undefined,
          upsert: false,
        });
        if (upErr) throw upErr;

        const status = expiryDate && isPast(new Date(expiryDate)) ? "expired" : "valid";
        const fileMeta = {
          file_path: path,
          file_name: row.cleanName,
          file_size: row.size,
          file_type: row.file.type || null,
          uploaded_by: user?.id ?? null,
        };

        if (kind === "documents") {
          const { error } = await supabase.from("staff_documents").insert({
            profile_id: profileId,
            document_type: docType,
            issuing_authority: issuingBody || null,
            expiry_date: expiryDate || null,
            status,
            ...fileMeta,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from("certifications").insert({
            profile_id: profileId,
            certification_name: certName,
            issuing_body: issuingBody || null,
            expiry_date: expiryDate || null,
            status,
            ...fileMeta,
          });
          if (error) throw error;
        }

        okCount++;
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "done" } : r)));
      } catch (e: any) {
        failCount++;
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "error", message: e.message || "Upload failed" } : r)));
      }
      done++;
      setProgress(Math.round((done / queue.length) * 100));
    }

    qc.invalidateQueries({ queryKey: [kind === "documents" ? "staff-documents" : "certifications"] });
    setRunning(false);
    if (failCount === 0) {
      toast.success(`${okCount} file${okCount === 1 ? "" : "s"} uploaded`);
    } else {
      toast.warning(`${okCount} succeeded, ${failCount} failed`);
    }
  }

  const pending = rows.filter((r) => r.status === "pending").length;
  const errored = rows.filter((r) => r.status === "error").length;
  const completed = rows.filter((r) => r.status === "done").length;

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk upload {kind === "documents" ? "documents" : "certifications"}</DialogTitle>
          <DialogDescription>
            Each file is checked for type, magic bytes, and size (max 10MB). Allowed: PDF, JPG, PNG, WEBP.
            All files in this batch will share the metadata below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Staff Member</Label>
            {isAdmin ? (
              <StaffCombobox staff={profiles as any} value={profileId} onValueChange={setProfileId} />
            ) : (
              <Input
                disabled
                value={(() => {
                  const p = profiles.find((x) => x.id === profileId);
                  return p ? `${p.last_name}, ${p.first_name} (${p.staff_id})` : "Yourself";
                })()}
              />
            )}
          </div>

          {kind === "documents" ? (
            <div>
              <Label>Document Type (applied to all)</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>Certification Name (applied to all)</Label>
              <Input value={certName} onChange={(e) => setCertName(e.target.value)} placeholder="e.g. First Aid" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{kind === "documents" ? "Issuing Authority" : "Issuing Body"}</Label>
              <Input value={issuingBody} onChange={(e) => setIssuingBody(e.target.value)} />
            </div>
            <div>
              <Label>Expiry Date (optional)</Label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border border-dashed p-4">
            <Label className="block mb-2">Files (up to 25)</Label>
            <input
              id="bulk-file-input"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePick}
              disabled={running}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("bulk-file-input")?.click()}
              disabled={running || rows.length >= 25}
              className="gap-1"
            >
              <Upload className="h-4 w-4" /> Choose files
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Max {(COMPLIANCE_MAX_BYTES / 1024 / 1024).toFixed(0)}MB per file. Magic-byte verification is performed on every file before upload.
            </p>
          </div>

          {rows.length > 0 && (
            <div className="rounded-lg border max-h-64 overflow-y-auto divide-y">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  {r.status === "pending" && <Badge variant="outline">Pending</Badge>}
                  {r.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                  {r.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  {r.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium" title={r.cleanName}>{r.cleanName}</div>
                    {r.message && <div className="text-destructive truncate">{r.message}</div>}
                  </div>
                  <span className="text-muted-foreground tabular-nums">{(r.size / 1024).toFixed(0)} KB</span>
                  {!running && r.status !== "done" && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(r.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {running && <Progress value={progress} className="h-2" />}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-xs text-muted-foreground">
              {pending} ready · {completed} done · {errored} failed
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Close</Button>
              <Button onClick={startUpload} disabled={!canStart} className="gap-1">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {running ? "Uploading..." : `Upload ${pending} file${pending === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
