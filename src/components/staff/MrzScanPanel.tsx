/**
 * MRZ scanning for staff KYC and verification.
 *
 * Reads the machine-readable zone of a passport (TD3) or ID card such as the
 * Ghana Card (TD1), verifies the ICAO check digits and offers the decoded
 * details for the record being filled in. A document reader or OCR service can
 * be plugged in later via `setMrzImageReader` — the panel then decodes an
 * uploaded/captured image automatically; until then the MRZ lines are keyed in
 * or pasted from the document.
 */
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, ScanLine, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/date-format";
import { hasMrzImageReader, parseMrz, readMrzFromImage, type MrzResult } from "@/lib/mrz";

export type MrzApplyValues = {
  surname: string;
  givenNames: string;
  sex: string;
  dateOfBirth: string | null;
  documentNumber: string;
  nationality: string;
  expiryDate: string | null;
};

export function MrzScanPanel({
  profileId,
  onApply,
}: {
  profileId?: string | null;
  /** Called when the officer chooses to copy the decoded details into the form. */
  onApply?: (values: MrzApplyValues) => void;
}) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<MrzResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const decode = (text: string) => {
    const parsed = parseMrz(text);
    if (!parsed) {
      setResult(null);
      setError("Those lines are not a recognisable machine-readable zone. A passport has 2 lines of 44 characters; an ID card has 3 lines of 30.");
      return null;
    }
    setError(null);
    setResult(parsed);
    return parsed;
  };

  const save = useMutation({
    mutationFn: async (parsed: MrzResult) => {
      if (!profileId) return;
      const { error: err } = await supabase.from("staff_mrz_scans").insert({
        profile_id: profileId,
        mrz_format: parsed.format,
        raw_mrz: parsed.raw,
        document_type: parsed.documentType || null,
        document_number: parsed.documentNumber || null,
        issuing_country: parsed.issuingCountry || null,
        surname: parsed.surname || null,
        given_names: parsed.givenNames || null,
        nationality: parsed.nationality || null,
        sex: parsed.sex || null,
        date_of_birth: parsed.dateOfBirth,
        expiry_date: parsed.expiryDate,
        checksum_valid: parsed.checksumValid,
      });
      if (err) throw err;
    },
    onSuccess: () => toast.success("Scan saved to the staff record"),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      const text = await readMrzFromImage(file);
      if (!text) {
        setError("No document reader is connected yet, so the image could not be read automatically. Type or paste the two or three MRZ lines below.");
        return;
      }
      setRaw(text);
      decode(text);
    } finally {
      setReading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanLine className="h-4 w-4" aria-hidden="true" />
          MRZ document scan
        </CardTitle>
        <CardDescription>
          Read a passport or ID card and check the details against this record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={reading}>
            {reading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
            Capture or upload document
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <span className="text-xs text-muted-foreground">
            {hasMrzImageReader() ? "Reader connected" : "Reader not connected — key in the lines below"}
          </span>
        </div>

        <div>
          <Label htmlFor="mrz-raw">Machine-readable zone lines</Label>
          <Textarea
            id="mrz-raw"
            rows={3}
            spellCheck={false}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"P<GHAMENSAH<<KOFI<<<<<<<<<<<<<<<<<<<<<<<<<<<\nG12345678GHA9001014M3001017<<<<<<<<<<<<<<02"}
            className="font-mono text-xs uppercase"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => decode(raw)} disabled={!raw.trim()}>
              Read document
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setRaw(""); setResult(null); setError(null); }}>
              Clear
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{result.format === "TD3" ? "Passport" : "ID card"}</Badge>
              {result.checksumValid ? (
                <Badge className="bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> All check digits valid
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-800">
                  <XCircle className="mr-1 h-3 w-3" /> Check digit mismatch
                </Badge>
              )}
            </div>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <Detail label="Surname" value={result.surname} />
              <Detail label="Given name(s)" value={result.givenNames} />
              <Detail label="Sex" value={result.sex} />
              <Detail label="Date of birth" value={result.dateOfBirth ? formatDate(result.dateOfBirth) : "—"} />
              <Detail label="Document number" value={result.documentNumber} />
              <Detail label="Nationality" value={result.nationality} />
              <Detail label="Issuing country" value={result.issuingCountry} />
              <Detail label="Expires" value={result.expiryDate ? formatDate(result.expiryDate) : "—"} />
            </dl>
            {!result.checksumValid && (
              <ul className="text-xs text-muted-foreground">
                {result.checks.filter((c) => !c.ok).map((c) => (
                  <li key={c.field}>{c.field}: check digit does not match</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {onApply && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onApply({
                      surname: result.surname,
                      givenNames: result.givenNames,
                      sex: result.sex,
                      dateOfBirth: result.dateOfBirth,
                      documentNumber: result.documentNumber,
                      nationality: result.nationality,
                      expiryDate: result.expiryDate,
                    });
                    toast.success("Details copied into the form");
                  }}
                >
                  Use these details
                </Button>
              )}
              {profileId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => save.mutate(result)}
                >
                  {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Save scan to record
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}

export default MrzScanPanel;
