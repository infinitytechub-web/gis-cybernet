import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface AssetQrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

/**
 * Renders an asset tag string as a QR code. Used in item detail drawer
 * and printable labels.
 */
export function AssetQrCode({ value, size = 160, className }: AssetQrCodeProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).catch(() => {});
  }, [value, size]);

  return <canvas ref={ref} className={className} aria-label={`QR code for ${value}`} />;
}
