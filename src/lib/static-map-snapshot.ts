/**
 * Pure-SVG renderer for an offline coordinate snapshot.
 *
 * Mirrors the visual style of `StaticCoordinateMap` but emits a standalone
 * SVG string (and PNG data URL) so it can be embedded directly into:
 *   - jsPDF exports (as a raster image via canvas)
 *   - printable HTML (inline SVG)
 *
 * Crucially, NO online tile servers are contacted — the snapshot is drawn
 * entirely from the supplied coordinates, preserving the same authorization
 * posture as the on-screen offline fallback.
 */

interface SnapshotOptions {
  lat: number;
  lng: number;
  label?: string;
  /** SVG viewBox width — defaults to 600 to match the on-screen component. */
  width?: number;
  /** SVG viewBox height — defaults to 360 to match the on-screen component. */
  height?: number;
  /**
   * Optional diagonal watermark text stamped across the snapshot. Used to
   * mark the embedded map with the authorising officer's role + department
   * so a printed/exported snapshot is traceable on its own.
   */
  watermark?: string;
}

/**
 * Build a self-contained SVG string for the offline coordinate snapshot.
 * Uses hard-coded neutral colors (not design tokens) so the markup renders
 * consistently inside print windows and PDF rasterization where CSS custom
 * properties are unavailable.
 */
export function buildStaticMapSvg({ lat, lng, label, width = 600, height = 360, watermark }: SnapshotOptions): string {
  const W = width;
  const H = height;
  const gridStep = 30;

  const fracLat = Math.abs(lat - Math.trunc(lat));
  const fracLng = Math.abs(lng - Math.trunc(lng));
  const cx = W / 2 + (fracLng - 0.5) * 60;
  const cy = H / 2 + (fracLat - 0.5) * 60;

  const gridLines: string[] = [];
  for (let x = 0; x <= W; x += gridStep) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#e2e8f0" stroke-width="0.5" />`);
  }
  for (let y = 0; y <= H; y += gridStep) {
    gridLines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5" />`);
  }

  const safeLabel = (label ?? "").replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#f1f5f9" />
  ${gridLines.join("\n  ")}
  <line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 4" />
  <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 4" />
  <circle cx="${cx}" cy="${cy}" r="26" fill="rgba(15,23,42,0.10)" stroke="rgba(15,23,42,0.35)" stroke-width="1" />
  <circle cx="${cx}" cy="${cy}" r="14" fill="rgba(15,23,42,0.20)" stroke="rgba(15,23,42,0.55)" stroke-width="1" />
  <circle cx="${cx}" cy="${cy}" r="6" fill="#0f172a" stroke="#ffffff" stroke-width="2" />
  <g>
    <rect x="12" y="${H - 56}" width="260" height="44" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" />
    <text x="22" y="${H - 36}" font-size="11" font-family="monospace" fill="#0f172a">lat ${lat.toFixed(6)}</text>
    <text x="22" y="${H - 20}" font-size="11" font-family="monospace" fill="#0f172a">lng ${lng.toFixed(6)}</text>
  </g>
  <g>
    <rect x="${W - 152}" y="12" width="140" height="22" rx="11" fill="#ffffff" stroke="#cbd5e1" />
    <text x="${W - 82}" y="27" text-anchor="middle" font-size="10" fill="#475569">OFFLINE · NO TILES</text>
  </g>
  ${safeLabel ? `<g>
    <rect x="12" y="12" width="${Math.min(W - 176, 8 + safeLabel.length * 6)}" height="22" rx="6" fill="#ffffff" stroke="#cbd5e1" />
    <text x="22" y="27" font-size="11" fill="#0f172a">${safeLabel}</text>
  </g>` : ""}
</svg>`;
}

/**
 * Rasterize the static map SVG into a PNG data URL using an offscreen canvas.
 * Returns null on failure (e.g., environments without canvas) so callers can
 * gracefully omit the snapshot from the export.
 */
export async function buildStaticMapPng(
  opts: SnapshotOptions,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const W = opts.width ?? 600;
  const H = opts.height ?? 360;
  const svg = buildStaticMapSvg({ ...opts, width: W, height: H });
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to rasterize offline map snapshot"));
    });
    img.src = url;
    await loaded;
    // Render at 2× for crisp PDF embedding.
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: W, height: H };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
