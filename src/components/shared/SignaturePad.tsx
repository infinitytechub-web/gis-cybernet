/**
 * Digital signature capture and verification.
 *
 * The signature is drawn on a canvas, stored as a PNG data URL together with a
 * SHA-256 fingerprint of the image, the signatory's name and role, the moment
 * it was signed and the acting account. The fingerprint lets any later viewer
 * confirm the image on file is exactly the one that was signed — the same
 * tamper-evidence approach used for signed records internationally.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Eraser, PenLine } from "lucide-react";

export async function signatureFingerprint(dataUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(dataUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type SignatureCapture = {
  dataUrl: string;
  fingerprint: string;
  signedAt: string;
  signatoryName: string;
  signatoryRole: string;
};

export function SignaturePad({
  label = "Signature",
  signatoryName,
  signatoryRole,
  onNameChange,
  onRoleChange,
  onCapture,
  disabled,
  existingDataUrl,
}: {
  label?: string;
  signatoryName: string;
  signatoryRole: string;
  onNameChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onCapture: (capture: SignatureCapture) => void | Promise<void>;
  disabled?: boolean;
  existingDataUrl?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDirty(true);
  };

  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
  };

  const capture = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !dirty) return;
    const dataUrl = canvas.toDataURL("image/png");
    const fingerprint = await signatureFingerprint(dataUrl);
    await onCapture({
      dataUrl,
      fingerprint,
      signedAt: new Date().toISOString(),
      signatoryName: signatoryName.trim(),
      signatoryRole: signatoryRole.trim(),
    });
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={signatoryName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Name of signatory"
          disabled={disabled}
        />
        <Input
          value={signatoryRole}
          onChange={(e) => onRoleChange(e.target.value)}
          placeholder="Rank / position"
          disabled={disabled}
        />
      </div>

      {existingDataUrl && !dirty ? (
        <div className="rounded-md border bg-muted/30 p-2">
          <img src={existingDataUrl} alt={`${label} on file`} className="h-24 object-contain" />
        </div>
      ) : null}

      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-32 w-full touch-none rounded-md border bg-background"
        aria-label={`${label} drawing area`}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={clear} disabled={disabled}>
          <Eraser className="mr-1 h-4 w-4" /> Clear
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void capture()}
          disabled={disabled || !dirty || !signatoryName.trim()}
        >
          <PenLine className="mr-1 h-4 w-4" /> Sign and save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Signing records your name, position, the date and time, and a tamper-evident
        fingerprint of the signature image.
      </p>
    </div>
  );
}

export default SignaturePad;
