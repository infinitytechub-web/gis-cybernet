import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download-utils";
import { Download, Loader2, LockKeyhole } from "lucide-react";

export default function GpsDownload() {
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const objectPath = params.get("object");
  const download = async () => {
    if (!objectPath) return;
    setBusy(true);
    setStatus("");
    try {
      const { data, error } = await supabase.functions.invoke("gps-cloud-export", {
        body: { action: "download", objectPath },
      });
      if (error || !(data instanceof Blob)) throw new Error("Download unavailable");
      const filename = objectPath.split("/").pop()?.slice(37) || "gps_export.csv";
      downloadBlob(data, filename);
      setStatus("Download ready.");
    } catch {
      setStatus("Download unavailable. The link may have expired or permission has been removed.");
    } finally {
      setBusy(false);
    }
  };
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-12">
    <LockKeyhole className="h-8 w-8 text-primary" />
    <h1 className="text-2xl font-semibold">GPS export</h1>
    <Button onClick={download} disabled={busy || !objectPath}>
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      Download CSV
    </Button>
    <p role="status" className="text-sm text-muted-foreground">{objectPath ? status : "Invalid download link."}</p>
  </main>;
}