import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine, Camera, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface AssetScannerProps {
  /** Called with the scanned asset tag string. */
  onScan: (value: string) => void;
  className?: string;
}

/**
 * Minimal in-app QR/barcode scanner using the native BarcodeDetector API.
 * Falls back to a friendly notice when unsupported (e.g. Safari iOS < 17).
 */
export function AssetScanner({ onScan, className }: AssetScannerProps) {
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);

  useEffect(() => {
    setSupported(typeof (window as any).BarcodeDetector !== "undefined");
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }
    if (!supported) return;
    start();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supported]);

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = async () => {
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const Detector = (window as any).BarcodeDetector;
      detectorRef.current = new Detector({ formats: ["qr_code", "code_128", "ean_13", "ean_8", "code_39"] });
      tick();
    } catch (err: any) {
      toast.error(err?.message ?? "Cannot access camera.");
      setOpen(false);
    } finally {
      setStarting(false);
    }
  };

  const tick = async () => {
    if (!detectorRef.current || !videoRef.current) return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes && codes.length > 0) {
        const value = codes[0].rawValue?.trim();
        if (value) {
          onScan(value);
          toast.success(`Scanned: ${value}`);
          setOpen(false);
          return;
        }
      }
    } catch {
      // ignore detector glitches
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`gap-1.5 ${className ?? ""}`}
        onClick={() => setOpen(true)}
      >
        <ScanLine className="h-4 w-4" /> Scan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" /> Scan asset tag
            </DialogTitle>
            <DialogDescription>
              Point your camera at an item label. The first QR or barcode detected will be used.
            </DialogDescription>
          </DialogHeader>

          {supported === false ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                This browser does not support in-app scanning. Use Chrome on Android, or print the
                tag and search by code (e.g. <span className="font-mono">GIS-2026-0001</span>).
              </span>
            </div>
          ) : (
            <div className="relative aspect-square rounded-md overflow-hidden bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-6 border-2 border-primary/70 rounded-lg pointer-events-none" />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
