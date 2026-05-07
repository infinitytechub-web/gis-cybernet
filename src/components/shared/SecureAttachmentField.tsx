import { useState } from "react";
import { Paperclip, X, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUploadGuard } from "@/components/security/FileUploadGuard";
import { uploadSecureFile } from "@/lib/secure-upload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SecureAttachmentFieldProps {
  /** Current storage path (or null/empty). */
  value: string | null;
  onChange: (path: string | null) => void;
  label?: string;
  accept?: string;
  disabled?: boolean;
}

/**
 * Reusable secure attachment picker for leave/pass/posting forms.
 * Scans the file via the firewall, uploads to the private `secure-uploads`
 * bucket, and exposes a download (via signed URL) + clear button.
 */
export function SecureAttachmentField({
  value, onChange, label = "Supporting document",
  accept = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx",
  disabled,
}: SecureAttachmentFieldProps) {
  const [uploading, setUploading] = useState(false);

  const handleAccept = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const { path } = await uploadSecureFile(files[0], { maxMb: 10 });
      onChange(path);
      toast.success("File uploaded securely");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!value) return;
    const { data, error } = await supabase.storage
      .from("secure-uploads")
      .createSignedUrl(value, 60);
    if (error || !data) { toast.error("Could not generate download link"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const filename = value ? value.split("/").pop()?.split("-").slice(2).join("-") : null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground flex items-center gap-1">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        {label} <span className="text-xs text-muted-foreground">(optional)</span>
      </div>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="truncate">{filename || "attachment"}</span>
          <div className="flex gap-1 shrink-0">
            <Button type="button" variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : uploading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Scanning & uploading…
        </div>
      ) : (
        <FileUploadGuard
          onAccept={handleAccept}
          accept={accept}
          disabled={disabled}
          buttonLabel="Attach file"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Files are virus-scanned and stored in the private secure-uploads vault. Max 10 MB.
      </p>
    </div>
  );
}
