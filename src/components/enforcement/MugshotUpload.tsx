import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validatePhotoFile } from "@/lib/image-upload";

const BUCKET = "enforcement-photos";

interface Props {
  value: string | null;
  onChange: (path: string | null) => void;
  /** Folder prefix inside the bucket — e.g. "enforcement" or "operations". */
  folder: string;
  disabled?: boolean;
}

export function MugshotUpload({ value, onChange, folder, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Resolve a signed URL for the existing path
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!value) { setPreviewUrl(null); return; }
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(value, 60 * 10);
      if (!cancelled) setPreviewUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [value]);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    // Under 3MB, a genuine image by magic bytes, and threat scanned.
    const check = await validatePhotoFile(file);
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }
    setUploading(true);
    try {
      const ext = check.ext;
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });
      if (error) throw error;
      // Remove previous photo if any
      if (value) {
        await supabase.storage.from(BUCKET).remove([value]).catch(() => {});
      }
      onChange(path);
      toast.success("Mugshot uploaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!value) return;
    setUploading(true);
    try {
      await supabase.storage.from(BUCKET).remove([value]);
      onChange(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => cameraRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Camera className="h-4 w-4 mr-1" />}
          Take Photo
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1" />
          Upload
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled || uploading} onClick={handleRemove} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Remove
          </Button>
        )}
      </div>
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Mugshot preview"
          loading="lazy"
          decoding="async"
          className="h-32 w-32 object-cover rounded-md border"
        />
      )}
    </div>
  );
}
