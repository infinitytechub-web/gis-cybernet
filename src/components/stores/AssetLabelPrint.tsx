import QRCode from "qrcode";
import { toast } from "sonner";
import { openPrintWindow } from "@/lib/safe-print";

export interface AssetLabelData {
  asset_tag: string;
  name: string;
  category?: string | null;
  location?: string | null;
  serial_number?: string | null;
}

/**
 * Opens a print window with a 60×40mm asset label (Sortly-style):
 * QR code on the left, asset tag + item name + meta on the right.
 */
export async function printAssetLabel(item: AssetLabelData) {
  if (!item.asset_tag) {
    toast.error("This item does not have an asset tag yet.");
    return;
  }
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(item.asset_tag, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
    });
  } catch {
    toast.error("Failed to generate QR code.");
    return;
  }

  const win = window.open("", "_blank", "width=520,height=360");
  const html = `<!doctype html>
<html>
<head>
  <title>Asset label — ${item.asset_tag}</title>
  <style>
    @page { size: 60mm 40mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, system-ui, sans-serif; color: #0f172a; }
    .label { width: 60mm; height: 40mm; padding: 2mm 3mm; display: flex; gap: 2mm; align-items: center; }
    .qr { flex: 0 0 30mm; height: 30mm; display: flex; align-items: center; justify-content: center; }
    .qr img { width: 30mm; height: 30mm; }
    .meta { flex: 1; min-width: 0; }
    .tag { font-family: ui-monospace, Menlo, monospace; font-size: 10pt; font-weight: 700; letter-spacing: 0.5px; }
    .name { font-size: 8.5pt; font-weight: 600; line-height: 1.15; margin-top: 0.5mm;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .sub { font-size: 6.5pt; color: #475569; margin-top: 0.5mm; line-height: 1.2; }
    .brand { font-size: 6pt; color: #64748b; margin-top: 1mm; letter-spacing: 0.4px; text-transform: uppercase; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="label">
    <div class="qr"><img src="${qrDataUrl}" alt="QR ${item.asset_tag}"/></div>
    <div class="meta">
      <div class="tag">${item.asset_tag}</div>
      <div class="name">${escapeHtml(item.name)}</div>
      <div class="sub">
        ${item.category ? escapeHtml(item.category) : ""}
        ${item.location ? ` · ${escapeHtml(item.location)}` : ""}
      </div>
      ${item.serial_number ? `<div class="sub">SN: ${escapeHtml(item.serial_number)}</div>` : ""}
      <div class="brand">GIS Cybernet · Stores</div>
    </div>
  </div>
</body>
</html>`;
  const win = openPrintWindow(html, { features: "noopener,noreferrer,width=520,height=360", printDelayMs: 400 });
  if (!win) {
    toast.error("Pop-up blocked. Allow pop-ups to print labels.");
    return;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch] as string));
}
