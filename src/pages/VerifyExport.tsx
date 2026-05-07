import { useState } from "react";
import { ShieldCheck, ShieldAlert, FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Re-derive the canonical content from a signed CSV by stripping the trailer.
function csvDataBlock(text: string): string {
  const marker = "\n# === SIGNED METADATA";
  const i = text.indexOf(marker);
  return i === -1 ? text : text.slice(0, i);
}

function parseTrailer(text: string): { sha256?: string; signature?: string; payload?: Record<string, unknown> } {
  const out: { sha256?: string; signature?: string; payload?: Record<string, unknown> } = {};
  for (const line of text.split("\n")) {
    if (line.startsWith("# SHA-256: ")) out.sha256 = line.slice(11).trim();
    else if (line.startsWith("# Signature: ")) out.signature = line.slice(13).trim();
    else if (line.startsWith("# Payload: ")) {
      try { out.payload = JSON.parse(line.slice(11).trim()); } catch { /* ignore */ }
    }
  }
  return out;
}

export default function VerifyExport() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<string | null>(null);
  const [csvOk, setCsvOk] = useState<boolean | null>(null);

  const [manualHash, setManualHash] = useState("");
  const [manualSig, setManualSig] = useState("");
  const [manualPayload, setManualPayload] = useState("");
  const [manualResult, setManualResult] = useState<string | null>(null);
  const [manualOk, setManualOk] = useState<boolean | null>(null);

  const verifyCsv = async () => {
    if (!csvFile) return;
    setCsvResult(null); setCsvOk(null);
    try {
      const text = await csvFile.text();
      const trailer = parseTrailer(text);
      if (!trailer.sha256 || !trailer.signature || !trailer.payload) {
        setCsvOk(false); setCsvResult("No signed-metadata trailer found in this file."); return;
      }
      const dataBlock = csvDataBlock(text);
      const computed = await sha256Hex(new TextEncoder().encode(dataBlock).buffer);
      if (computed.toLowerCase() !== trailer.sha256.toLowerCase()) {
        setCsvOk(false);
        setCsvResult(`HASH MISMATCH — file content was modified.\n\nExpected SHA-256: ${trailer.sha256}\nComputed SHA-256: ${computed}`);
        return;
      }
      // Verify signature with edge function
      const { data, error } = await supabase.functions.invoke("sign-export", {
        body: { verifySignature: trailer.signature, verifyPayload: trailer.payload },
      });
      if (error) throw new Error(error.message);
      const ok = !!(data as { valid?: boolean }).valid;
      setCsvOk(ok);
      setCsvResult(
        ok
          ? `✅ VERIFIED — content hash matches and signature is valid.\n\nSHA-256: ${computed}\nIssued: ${(trailer.payload as { issued_at?: string }).issued_at}\nIssuer: ${(trailer.payload as { issuer?: string }).issuer}`
          : "Hash matches but the signature is invalid (forged or wrong signing key).",
      );
    } catch (e) {
      setCsvOk(false); setCsvResult(`Error: ${(e as Error).message}`);
    }
  };

  const verifyManual = async () => {
    setManualResult(null); setManualOk(null);
    try {
      const payload = JSON.parse(manualPayload);
      if (!/^[0-9a-f]{64}$/i.test(manualHash.trim())) throw new Error("Hash must be a 64-char hex string");
      if (payload.content_sha256?.toLowerCase() !== manualHash.trim().toLowerCase()) {
        setManualOk(false);
        setManualResult("Provided SHA-256 does not match payload.content_sha256.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("sign-export", {
        body: { verifySignature: manualSig.trim(), verifyPayload: payload },
      });
      if (error) throw new Error(error.message);
      const ok = !!(data as { valid?: boolean }).valid;
      setManualOk(ok);
      setManualResult(ok ? "✅ Signature is valid for this payload." : "❌ Signature is INVALID.");
    } catch (e) {
      setManualOk(false); setManualResult(`Error: ${(e as Error).message}`);
    }
  };

  const ResultBox = ({ ok, text }: { ok: boolean | null; text: string | null }) =>
    text ? (
      <pre
        className={`mt-3 p-3 rounded-md text-xs whitespace-pre-wrap break-all border ${
          ok === true ? "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : ok === false ? "bg-red-50 border-red-300 text-red-900 dark:bg-red-950/40 dark:text-red-200"
          : "bg-muted"
        }`}
      >{text}</pre>
    ) : null;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Verify Signed Export</h1>
          <p className="text-sm text-muted-foreground">
            Confirms a route-history CSV/PDF hasn't been altered and was signed by this server.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileUp className="h-4 w-4" /> Verify a CSV file</CardTitle>
          <CardDescription>Upload the signed CSV; the trailer is parsed automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" accept=".csv,text/csv" onChange={e => setCsvFile(e.target.files?.[0] ?? null)} />
          <Button onClick={verifyCsv} disabled={!csvFile}>Verify CSV</Button>
          <ResultBox ok={csvOk} text={csvResult} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Verify manually (PDF)</CardTitle>
          <CardDescription>From the PDF's last "Signed Export Metadata" page, paste the SHA-256, signature, and payload JSON.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">SHA-256 (hex)</Label>
            <Input value={manualHash} onChange={e => setManualHash(e.target.value)} placeholder="64 hex chars" className="font-mono" />
          </div>
          <div>
            <Label className="text-xs">Signature</Label>
            <Input value={manualSig} onChange={e => setManualSig(e.target.value)} placeholder="HMAC-SHA256 hex" className="font-mono" />
          </div>
          <div>
            <Label className="text-xs">Payload (JSON)</Label>
            <Textarea value={manualPayload} onChange={e => setManualPayload(e.target.value)} placeholder='{"content_sha256":"...","kind":"...","range":"...","record_count":N,"user_id":"...","issued_at":"...","issuer":"...","version":1}' rows={6} className="font-mono text-xs" />
          </div>
          <Button onClick={verifyManual} disabled={!manualHash || !manualSig || !manualPayload}>Verify signature</Button>
          <ResultBox ok={manualOk} text={manualResult} />
          <p className="text-xs text-muted-foreground">
            Tip: also compute the PDF's content hash with the same canonical JSON shown on the metadata page if you want to confirm the underlying data is unchanged.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
