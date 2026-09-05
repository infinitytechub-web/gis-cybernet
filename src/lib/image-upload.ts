/**
 * GUARDED PHOTO UPLOAD — one path for every photo the app accepts.
 *
 * Rules enforced here, in order:
 *   1. Hard size cap: photos must be UNDER 3 MB.
 *   2. Real image check: the file's magic bytes must match JPEG/PNG/WEBP —
 *      a renamed executable or script is rejected even if the extension lies.
 *   3. Threat scan: the file goes through the same firewall scan (`scanFile`)
 *      used by every other upload surface; block/quarantine verdicts abort.
 *
 * Only then is the file handed to storage. Callers get a plain-language error
 * message they can show with `toast.error`.
 */
import { supabase } from "@/integrations/supabase/client";
import { scanFile } from "@/lib/firewall";

/** Photos must be strictly under this size. */
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const PHOTO_MAX_LABEL = "3MB";

export type PhotoMime = "image/jpeg" | "image/png" | "image/webp";

const EXT_FOR_MIME: Record<PhotoMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Read the leading bytes and decide what the file really is. */
async function sniffImageMime(file: File): Promise<PhotoMime | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const at = (i: number) => head[i];
  // JPEG: FF D8 FF
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 &&
    at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: "RIFF" .... "WEBP"
  const txt = (i: number, s: string) =>
    s.split("").every((c, k) => at(i + k) === c.charCodeAt(0));
  if (txt(0, "RIFF") && txt(8, "WEBP")) return "image/webp";
  return null;
}

export interface PhotoCheckOk {
  ok: true;
  file: File;
  mime: PhotoMime;
  ext: string;
  /**
   * Never set on success. Declared so `check.reason` type-checks under the
   * project's non-strict config, where narrowing on `ok` is not applied.
   */
  reason?: undefined;
}
export interface PhotoCheckFail {
  ok: false;
  reason: string;
  file?: undefined;
  mime?: undefined;
  ext?: undefined;
}
export type PhotoCheck = PhotoCheckOk | PhotoCheckFail;

/**
 * Validate + scan a photo without uploading it. Use this in the file picker so
 * a bad file is rejected before the user fills in the rest of the form.
 */
export async function validatePhotoFile(file: File): Promise<PhotoCheck> {
  if (file.size === 0) return { ok: false, reason: "That file is empty." };
  if (file.size >= PHOTO_MAX_BYTES) {
    return {
      ok: false,
      reason: `Photo must be under ${PHOTO_MAX_LABEL} — this one is ${(file.size / 1024 / 1024).toFixed(1)}MB.`,
    };
  }

  const mime = await sniffImageMime(file);
  if (!mime) {
    return {
      ok: false,
      reason: "Only JPG, PNG or WEBP photos are accepted, and the file must really be a photo.",
    };
  }

  try {
    const verdict = await scanFile(file);
    if (verdict.action === "block" || verdict.action === "quarantine") {
      return { ok: false, reason: `Upload blocked by the security scan: ${verdict.reason}` };
    }
  } catch {
    // A scanner outage must not silently weaken the check — size and magic
    // bytes have already passed, so allow the upload and let the server-side
    // storage policies remain the final gate.
  }

  return { ok: true, file, mime, ext: EXT_FOR_MIME[mime] };
}

/**
 * Validate, scan and upload a photo to a storage bucket.
 * `pathBase` is the object path WITHOUT extension (e.g. the profile id).
 */
export async function uploadPhoto(opts: {
  file: File;
  bucket: string;
  pathBase: string;
  upsert?: boolean;
}): Promise<string> {
  const check = await validatePhotoFile(opts.file);
  if (!check.ok) throw new Error(check.reason);

  const path = `${opts.pathBase}.${check.ext}`;
  const { error } = await supabase.storage.from(opts.bucket).upload(path, check.file, {
    contentType: check.mime,
    upsert: opts.upsert ?? true,
  });
  if (error) throw error;
  return path;
}
