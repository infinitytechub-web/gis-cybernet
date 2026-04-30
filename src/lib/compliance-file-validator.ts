// Stricter file validation for Compliance uploads.
// - Enforces extension <-> declared MIME consistency
// - Sniffs magic bytes to confirm real file type (defends against spoofed extensions)
// - Rejects double-extensions, executables, scripts, archives, and HTML-ish payloads
// - Sanitises filenames
//
// Allowed types: PDF, JPG, PNG, WEBP. Max 10MB.

export const COMPLIANCE_MAX_BYTES = 10 * 1024 * 1024;

export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

const ALLOWED: AllowedMime[] = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const EXT_TO_MIME: Record<string, AllowedMime> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Patterns that should never appear inside a "document" upload.
const DANGEROUS_EXT = new Set([
  "exe","msi","bat","cmd","com","scr","ps1","sh","bash","zsh","app","apk","ipa","jar",
  "js","mjs","cjs","ts","tsx","jsx","vbs","vbe","wsf","wsh","hta","reg","cpl",
  "html","htm","xhtml","svg","mhtml","xml",
  "zip","rar","7z","tar","gz","bz2","xz","iso","img","dmg","pkg",
  "doc","docx","docm","xls","xlsx","xlsm","ppt","pptx","pptm",
  "lnk","url","desktop","scpt","applescript",
]);

export interface ValidationOk {
  ok: true;
  file: File;
  detectedMime: AllowedMime;
  cleanName: string;
  ext: string;
}
export interface ValidationFail {
  ok: false;
  reason: string;
}
export type ValidationResult = ValidationOk | ValidationFail;

function sanitiseName(name: string): string {
  // Strip path separators, control chars, NULL bytes, leading dots
  const base = name.split(/[\\/]/).pop() ?? name;
  return base
    .replace(/[\x00-\x1f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);
}

function getExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function hasDoubleExtension(name: string): boolean {
  // e.g. "passport.pdf.exe" or "scan.png.js"
  const parts = name.toLowerCase().split(".");
  if (parts.length < 3) return false;
  // Only flag when an inner segment looks like an "image/doc" extension AND
  // the final extension is something else.
  const inner = parts.slice(1, -1);
  return inner.some((p) => p in EXT_TO_MIME);
}

async function sniffMime(file: File): Promise<AllowedMime | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const hex = Array.from(head.slice(0, 12)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // %PDF
  if (hex.startsWith("25504446")) return "application/pdf";
  // PNG
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  // JPEG (FFD8FF)
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  // WEBP — RIFF....WEBP
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

export async function validateComplianceFile(file: File): Promise<ValidationResult> {
  if (!file) return { ok: false, reason: "No file selected" };
  if (file.size === 0) return { ok: false, reason: `${file.name}: file is empty` };
  if (file.size > COMPLIANCE_MAX_BYTES) {
    return { ok: false, reason: `${file.name}: exceeds 10MB limit` };
  }

  const cleanName = sanitiseName(file.name);
  if (!cleanName) return { ok: false, reason: "Invalid filename" };

  const ext = getExt(cleanName);
  if (!ext) return { ok: false, reason: `${cleanName}: missing file extension` };

  if (DANGEROUS_EXT.has(ext)) {
    return { ok: false, reason: `${cleanName}: ".${ext}" files are not allowed` };
  }
  if (!(ext in EXT_TO_MIME)) {
    return { ok: false, reason: `${cleanName}: only PDF, JPG, PNG, or WEBP allowed` };
  }
  if (hasDoubleExtension(cleanName)) {
    return { ok: false, reason: `${cleanName}: double extensions are not allowed` };
  }

  const expectedMime = EXT_TO_MIME[ext];
  const declared = (file.type || "").toLowerCase();

  // Browsers sometimes leave file.type empty — accept that, but if it's set it must match.
  if (declared && declared !== expectedMime && !ALLOWED.includes(declared as AllowedMime)) {
    return { ok: false, reason: `${cleanName}: declared type "${declared}" not allowed` };
  }
  if (declared && declared !== expectedMime) {
    return { ok: false, reason: `${cleanName}: extension and content type don't match` };
  }

  // Magic-byte sniff — the real safety net against renamed payloads.
  const sniffed = await sniffMime(file);
  if (!sniffed) {
    return { ok: false, reason: `${cleanName}: file content is not a valid PDF or image` };
  }
  if (sniffed !== expectedMime) {
    return { ok: false, reason: `${cleanName}: content (${sniffed}) doesn't match extension (.${ext})` };
  }

  return { ok: true, file, detectedMime: sniffed, cleanName, ext };
}
