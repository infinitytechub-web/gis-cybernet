// src/components/applications/ApplicationDocuments.tsx
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Download, X, ShieldCheck, AlertCircle, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { FileUploadGuard } from "@/components/security/FileUploadGuard";
import { uploadSecureFile } from "@/lib/secure-upload";
import { getSlots, type RecordType, type DocSlot } from "@/lib/application-documents";

interface Props {
  recordType: RecordType;
  recordId: string | null;
  permitType?: string | null;
  /** Read-only mode (e.g. for processing review). */
  readOnly?: boolean;
}

interface DocRow {
  id: string;
  slot: string;
  slot_label: string | null;
  storage_path: string;
  filename: string;
  size_bytes: number | null;
  mime_type: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

/**
 * Slot-based secure document upload list.
 * - Each slot uses FileUploadGuard (firewall scan + magic-byte sniff).
 * - Files are stored privately in `secure-uploads` (signed-URL access).
 * - One row per (record_type, record_id, slot) — re-upload replaces previous.
 */
export function ApplicationDocuments({ recordType, recordId, permitType, readOnly }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const slots = getSlots(recordType, permitType);
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const queryKey = ["application_documents", recordType, recordId];

  const { data: docs = [], isLoading } = useQuery<DocRow[]>({
    queryKey,
    queryFn: async () => {
      if (!recordId) return [];
      const { data, error } = await (supabase as any)
        .from("application_documents")
        .select("*")
        .eq("record_type", recordType)
        .eq("record_id", recordId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!recordId,
  });

  useEffect(() => {
    if (!recordId) return;
    const ch = supabase
      .channel(`appdocs-${recordType}-${recordId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "application_documents",
        filter: `record_id=eq.${recordId}`,
      }, () => qc.invalidateQueries({ queryKey }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [recordId, recordType, qc]);

  const docFor = (slotKey: string) => docs.find((d) => d.slot === slotKey);

  const uploadFor = async (slot: DocSlot, files: File[]) => {
    if (!recordId || !user || !files.length) return;
    setBusySlot(slot.key);
    try {
      const { path, sha } = await uploadSecureFile(files[0], { maxMb: 10 });
      // Replace previous file for this slot, if any
      const prev = docFor(slot.key);
      if (prev) {
        await supabase.storage.from("secure-uploads").remove([prev.storage_path]).catch(() => {});
        await (supabase as any).from("application_documents").delete().eq("id", prev.id);
      }
      const { error } = await (supabase as any).from("application_documents").insert({
        record_type: recordType,
        record_id: recordId,
        slot: slot.key,
        slot_label: slot.label,
        storage_path: path,
        filename: files[0].name,
        size_bytes: files[0].size,
        mime_type: files[0].type || null,
        sha256: sha,
        scan_action: "allow",
        uploaded_by: user.id,
      });
      if (error) throw error;
      toast.success(`${slot.label} uploaded`);
      qc.invalidateQueries({ queryKey });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusySlot(null);
    }
  };

  const removeDoc = async (doc: DocRow) => {
    if (!confirm(`Remove ${doc.filename}?`)) return;
    setBusySlot(doc.slot);
    try {
      await supabase.storage.from("secure-uploads").remove([doc.storage_path]).catch(() => {});
      const { error } = await (supabase as any).from("application_documents").delete().eq("id", doc.id);
      if (error) throw error;
      toast.success("Removed");
      qc.invalidateQueries({ queryKey });
    } catch (e: any) {
      toast.error(e.message ?? "Remove failed");
    } finally {
      setBusySlot(null);
    }
  };

  const download = async (doc: DocRow) => {
    const { data, error } = await supabase.storage
      .from("secure-uploads").createSignedUrl(doc.storage_path, 60);
    if (error || !data) { toast.error("Could not generate link"); return; }
    window.open(data.signedUrl, "_blank");
  };

  if (!recordId) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Save the application first to attach supporting documents.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Supporting Documents
          <span className="text-xs font-normal text-muted-foreground">
            (virus-scanned • encrypted at rest • signed-URL access)
          </span>
        </div>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="rounded-md border divide-y">
        {slots.map((slot) => {
          const doc = docFor(slot.key);
          const busy = busySlot === slot.key;
          return (
            <div key={slot.key} className="flex flex-wrap items-center gap-2 p-2 text-sm">
              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{slot.label}</span>
                {slot.required && <Badge variant="destructive" className="text-[10px] py-0 px-1.5">required</Badge>}
                {!doc && slot.required && (
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Missing required document" />
                )}
              </div>
              {doc ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="truncate max-w-[180px]" title={doc.filename}>{doc.filename}</span>
                  {doc.size_bytes != null && (
                    <span className="text-muted-foreground">({Math.max(1, Math.round(doc.size_bytes / 1024))} KB)</span>
                  )}
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => download(doc)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {!readOnly && (
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeDoc(doc)} disabled={busy}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ) : readOnly ? (
                <span className="text-xs text-muted-foreground">Not provided</span>
              ) : (
                <FileUploadGuard
                  onAccept={(files) => uploadFor(slot, files)}
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  disabled={busy}
                  buttonLabel={busy ? "Uploading…" : "Upload"}
                  className=""
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Files: PDF / JPG / PNG / WEBP, max 10 MB each. Replacing a slot deletes the previous file.
      </p>
    </div>
  );
}
