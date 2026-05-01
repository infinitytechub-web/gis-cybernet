import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, ShieldCheck, Loader2, Upload } from "lucide-react";
import { scanFile, recordFirewallEvent, type FirewallVerdict } from "@/lib/firewall";
import { toast } from "sonner";

interface FileUploadGuardProps {
  /** Called only with files the firewall judged safe (`allow`). */
  onAccept: (files: File[]) => void;
  /** Optional callback when a file is quarantined / blocked / warned. */
  onReject?: (rejections: { file: File; verdict: FirewallVerdict }[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  buttonLabel?: ReactNode;
  className?: string;
}

/**
 * Drop-in replacement for a file <Input>. Every selected file is scanned by
 * the firewall (extension/MIME/size + magic-byte sniffing). Quarantined files
 * are reported to the admin review queue automatically.
 */
export function FileUploadGuard({
  onAccept, onReject, accept, multiple = false,
  disabled, buttonLabel, className,
}: FileUploadGuardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [lastReject, setLastReject] = useState<{ name: string; verdict: FirewallVerdict } | null>(null);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-pick of same file
    if (files.length === 0) return;

    setScanning(true);
    const accepted: File[] = [];
    const rejected: { file: File; verdict: FirewallVerdict }[] = [];

    for (const file of files) {
      try {
        const verdict = await scanFile(file);
        await recordFirewallEvent({
          layer: "file",
          action: verdict.action,
          subject: file.name,
          details: {
            reason: verdict.reason,
            size_bytes: file.size,
            mime: file.type,
            ...(verdict.extra ?? {}),
          },
          matched_rule_id: verdict.matched_rule_id,
          matched_threat_id: verdict.matched_threat_id,
        });

        if (verdict.action === "allow" || verdict.action === "warn") {
          accepted.push(file);
          if (verdict.action === "warn") {
            toast.warning(`${file.name}: ${verdict.reason}`);
          }
        } else {
          rejected.push({ file, verdict });
          setLastReject({ name: file.name, verdict });
          if (verdict.action === "block") {
            toast.error(`Blocked ${file.name}: ${verdict.reason}`);
          } else {
            toast.warning(`${file.name} sent for admin review: ${verdict.reason}`);
          }
        }
      } catch (err: any) {
        rejected.push({ file, verdict: { action: "block", reason: err?.message ?? "scan failed" } });
        toast.error(`${file.name}: scan failed`);
      }
    }

    setScanning(false);
    if (accepted.length) onAccept(accepted);
    if (rejected.length) onReject?.(rejected);
  };

  return (
    <div className={className}>
      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onChange}
        disabled={disabled || scanning}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || scanning}
        className="gap-2"
      >
        {scanning
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Upload className="h-4 w-4 text-primary" />}
        {scanning ? "Scanning…" : (buttonLabel ?? "Choose file")}
      </Button>
      {lastReject && (
        <Alert variant={lastReject.verdict.action === "block" ? "destructive" : "default"} className="mt-2">
          {lastReject.verdict.action === "block"
            ? <ShieldAlert className="h-4 w-4" />
            : <ShieldCheck className="h-4 w-4 text-amber-600" />}
          <AlertDescription className="text-xs">
            <strong>{lastReject.name}</strong> — {lastReject.verdict.reason}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
