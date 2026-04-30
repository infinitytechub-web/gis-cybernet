import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Paperclip, Loader2, X, Download } from "lucide-react";
import { toast } from "sonner";
import { validateComplianceFile } from "@/lib/compliance-file-validator";

const BUCKET = "staff-documents";

export interface ComplianceFile {
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
}

interface Props {
  profileId: string;
  subfolder: "documents" | "certifications";
  value: ComplianceFile;
  onChange: (next: ComplianceFile) => void;
  uploading: boolean;
  setUploading: (u: boolean) => void;
}

export function ComplianceFileInput({ profileId, subfolder, value, onChange, uploading, setUploading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!profileId) {
      toast.error("Select staff member first");
      return;
    }
    const check = await validateComplianceFile(file);
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }
    setUploading(true);
    try {
      const path = `${profileId}/${subfolder}/${Date.now()}-${crypto.randomUUID()}.${check.ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, check.file, {
        contentType: check.detectedMime,
        upsert: false,
      });
      if (error) throw error;
      // best-effort delete previous file
      if (value.file_path) {
        await supabase.storage.from(BUCKET).remove([value.file_path]).catch(() => {});
      }
      onChange({
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
      });
      toast.success("File attached");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!value.file_path) return;
    setUploading(true);
    try {
      await supabase.storage.from(BUCKET).remove([value.file_path]).catch(() => {});
      onChange({ file_path: null, file_name: null, file_size: null, file_type: null });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <Label>Attachment (PDF/JPG/PNG, max 10MB)</Label>
      <div className="flex items-center gap-2 mt-1">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
          className="hidden"
          onChange={handlePick}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !profileId}
          className="gap-1"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          {value.file_path ? "Replace file" : "Choose file"}
        </Button>
        {value.file_name && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground truncate flex-1">
            <span className="truncate" title={value.file_name}>{value.file_name}</span>
            {value.file_size != null && <span>({(value.file_size / 1024).toFixed(0)} KB)</span>}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleRemove}
              disabled={uploading}
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export async function downloadComplianceFile(filePath: string, fileName?: string | null) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60);
  if (error || !data?.signedUrl) {
    toast.error("Could not generate download link");
    return;
  }
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = fileName || "file";
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function FileLinkButton({ filePath, fileName }: { filePath: string | null; fileName?: string | null }) {
  if (!filePath) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 gap-1 text-xs"
      onClick={() => downloadComplianceFile(filePath, fileName)}
    >
      <Download className="h-3.5 w-3.5" /> View
    </Button>
  );
}
