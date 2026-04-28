import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ItemPhotoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
}

/**
 * Square photo uploader for an inventory item. Stores the file in
 * `inventory-photos` bucket and returns a public-URL-style storage path.
 */
export function ItemPhotoUpload({ value, onChange }: ItemPhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve display URL when value changes
  useState(() => {
    if (value) resolveSignedUrl(value).then(setSignedUrl);
  });

  async function resolveSignedUrl(path: string): Promise<string | null> {
    if (path.startsWith("http")) return path;
    const { data } = await supabase.storage
      .from("inventory-photos")
      .createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  }

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `items/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("inventory-photos")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const url = await resolveSignedUrl(path);
      setSignedUrl(url);
      onChange(path);
      toast.success("Photo uploaded.");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onChange(null);
    setSignedUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-20 w-20 rounded-md border bg-muted/30 overflow-hidden flex items-center justify-center">
        {signedUrl ? (
          <img src={signedUrl} alt="Item" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Replace photo" : "Upload photo"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={handleRemove} className="gap-1.5 text-destructive">
            <X className="h-3.5 w-3.5" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
