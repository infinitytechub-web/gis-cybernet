/**
 * Live document reader for the MRZ scanner.
 *
 * Registers a reader with `setMrzImageReader` so the KYC scan panel can decode
 * a photograph of a Ghana Card, ECOWAS card or passport automatically. The photo
 * is downscaled in the browser (keeping the MRZ legible while cutting upload
 * size) and sent to the `read-mrz` backend function, which transcribes only the
 * machine-readable lines. Parsing and check digits stay in `mrz.ts`.
 */
import { supabase } from "@/integrations/supabase/client";
import { setMrzImageReader } from "@/lib/mrz";

const MAX_EDGE = 1800;
const MIN_LINE = 28;

export class MrzReadError extends Error {}

/** Downscale to at most MAX_EDGE on the long edge and return a JPEG data URL. */
export async function imageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new MrzReadError("This browser cannot process the photo");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Send a document photo to the reader and return the raw MRZ lines. */
export async function readMrzViaBackend(file: File): Promise<string | null> {
  const image = await imageToDataUrl(file);
  const { data, error } = await supabase.functions.invoke("read-mrz", { body: { image } });
  if (error) {
    const message =
      (data as { error?: string } | null)?.error ??
      "The document reader could not be reached — key in the MRZ lines instead";
    throw new MrzReadError(message);
  }
  const result = data as { mrz?: string | null; error?: string } | null;
  if (result?.error) throw new MrzReadError(result.error);
  const mrz = (result?.mrz ?? "").trim();
  if (!mrz) return null;
  // Guard against a partial transcription: every line must look like an MRZ row.
  const lines = mrz.split("\n").filter((l) => l.length >= MIN_LINE);
  return lines.length >= 2 ? lines.join("\n") : null;
}

let registered = false;

/** Called once at start-up so the scan panel reports a connected reader. */
export function registerMrzReader() {
  if (registered) return;
  registered = true;
  setMrzImageReader(readMrzViaBackend);
}
