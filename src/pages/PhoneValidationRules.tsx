import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Globe2, Phone, ShieldAlert, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  ALL_GHANA_PREFIXES,
  CONTACT_PHONE_HINT,
  GHANA_NETWORK_PREFIXES,
  GHANA_PHONE_HINT,
  GHANA_PHONE_PLACEHOLDER,
  formatGhanaPhone,
  normalizeGhanaPhone,
  validateContactPhone,
  validateGhanaPhone,
  type GhanaNetwork,
} from "@/lib/ghana-phone";

const ACCEPTED_FORMS: { input: string; note: string }[] = [
  { input: "0241234567", note: "Local 10-digit form — the canonical stored value." },
  { input: "024 123 4567", note: "Spaces, dashes and brackets are stripped before validation." },
  { input: "+233241234567", note: "E.164 form — normalised back to the local 0XX form." },
  { input: "233241234567", note: "Country code without a plus." },
  { input: "00233241234567", note: "International access prefix (00) form." },
  { input: "+447700900123", note: "Explicit foreign code — accepted on contact fields only (8–15 digits)." },
];

const FABRICATED_RULES: { rule: string; example: string }[] = [
  { rule: "All seven subscriber digits identical", example: "0241111111" },
  { rule: "Known placeholder subscriber blocks (1234567, 7654321, 0123456, 1111111, 0000000)", example: "0241234567" },
  { rule: "Two-digit pair repeated three times plus one digit", example: "0241212123" },
  { rule: "International: every digit identical, or ends in 123456", example: "+441111111111" },
];

const SAMPLES = ["0241234567", "0209876543", "+233559876543", "0281234567", "0241111111", "+447700900123"];

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium break-all text-right">{value || "—"}</span>
    </div>
  );
}

export default function PhoneValidationRules() {
  const { isAdmin, isOic, is2ic } = useAuth();
  const allowed = isAdmin || isOic || is2ic;
  const [sample, setSample] = useState("0241234567");

  const strict = useMemo(() => validateGhanaPhone(sample), [sample]);
  const contact = useMemo(() => validateContactPhone(sample), [sample]);

  if (!allowed) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Restricted</AlertTitle>
          <AlertDescription>
            Phone validation rules are visible to System Administrators, OIC and 2IC only.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
          Phone validation rules
        </h1>
        <p className="text-sm text-muted-foreground">
          The active Ghana and international number rules enforced on every form, service and API
          endpoint. Use the checker below to troubleshoot a rejected number.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Rule checker</CardTitle>
          <CardDescription className="text-xs">
            Runs the same validator the forms use — nothing is saved or logged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone-check" className="text-xs">Number to test</Label>
            <Input
              id="phone-check"
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder={GHANA_PHONE_PLACEHOLDER}
              className="max-w-xs font-mono"
            />
            <p className="text-[11px] text-muted-foreground">{CONTACT_PHONE_HINT}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSample(s)}
                className="rounded-md border px-2 py-1 font-mono text-[11px] transition-colors hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                {strict.valid && !strict.suspicious ? (
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                )}
                Ghana-strict rule (staff records)
                {strict.suspicious && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">Suspicious</Badge>
                )}
              </div>
              <ResultRow label="Normalised local" value={normalizeGhanaPhone(sample)} />
              <ResultRow label="Display format" value={strict.valid ? formatGhanaPhone(sample) : ""} />
              <ResultRow label="E.164" value={strict.e164} />
              <ResultRow label="Network" value={strict.network ?? ""} />
              <ResultRow label="Verdict" value={strict.valid ? (strict.suspicious ? "Valid but flagged" : "Accepted") : "Rejected"} />
              <ResultRow label="Message" value={strict.error ?? "None"} />
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                {contact.valid ? (
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                )}
                Contact rule (biodata &amp; foreign nationals)
                <Badge variant="outline" className="ml-auto text-[10px] capitalize">{contact.kind}</Badge>
              </div>
              <ResultRow label="Canonical value stored" value={contact.canonical} />
              <ResultRow label="Verdict" value={contact.valid ? "Accepted" : "Rejected"} />
              <ResultRow label="Message" value={contact.error ?? "None"} />
              <p className="pt-2 text-[11px] text-muted-foreground">
                Contact fields accept an explicit foreign dialling code; a bare local or +233 number
                is still held to the full Ghana rules.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Licensed Ghana network prefixes</CardTitle>
            <CardDescription className="text-xs">{GHANA_PHONE_HINT} · {ALL_GHANA_PREFIXES.length} prefixes active</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Network</TableHead>
                  <TableHead className="text-xs">Prefixes (local 0XX)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.keys(GHANA_NETWORK_PREFIXES) as GhanaNetwork[]).map((net) => (
                  <TableRow key={net}>
                    <TableCell className="py-2 text-xs font-medium">{net}</TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {GHANA_NETWORK_PREFIXES[net].map((p) => (
                          <Badge key={p} variant="outline" className="font-mono text-[10px]">{p}</Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Accepted input formats</CardTitle>
            <CardDescription className="text-xs">All forms are normalised before storage.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Input</TableHead>
                  <TableHead className="text-xs">Handling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ACCEPTED_FORMS.map((f) => (
                  <TableRow key={f.input}>
                    <TableCell className="py-2 font-mono text-xs">{f.input}</TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{f.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
              Fabricated-number patterns
            </CardTitle>
            <CardDescription className="text-xs">
              Numbers with a valid prefix and length are still rejected when the digit pattern looks forged.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Pattern</TableHead>
                  <TableHead className="w-36 text-xs">Example</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FABRICATED_RULES.map((r) => (
                  <TableRow key={r.rule}>
                    <TableCell className="py-2 text-xs">{r.rule}</TableCell>
                    <TableCell className="py-2 font-mono text-xs">{r.example}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe2 className="h-4 w-4 text-primary" aria-hidden="true" />
              Where the rules are enforced
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Client:</span> every phone input runs the
              shared validator, so a rejected number never reaches the network.
            </p>
            <p>
              <span className="font-medium text-foreground">Database:</span> mirrored checks re-validate
              and normalise numbers on write, so imports, bulk uploads and API calls are held to the same
              rules as the forms.
            </p>
            <p>
              <span className="font-medium text-foreground">Troubleshooting:</span> when a user reports a
              rejection, paste their number into the checker above. A "not a licensed prefix" message means
              the network prefix is missing from the table; a "looks fabricated" message means the digit
              pattern matched one of the forged patterns and the number must be confirmed with the officer.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
