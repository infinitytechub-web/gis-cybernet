// src/lib/secure-upload.ts
// Risk-based upload + secure storage helper. Uses FileUploadGuard's verdict
// (magic-byte sniff + server WAF) and uploads ALLOW/WARN files to the private
// `secure-uploads` bucket under the user's UID folder.

import { supabase } from "@/integrations/supabase/client";
import { scanFile } from "@/lib/firewall";

const HARD_BLOCK_EXT = [
  "exe","com","bat","cmd","msi","scr","cpl","dll","sys","ps1","ps2","vbs","vbe","wsf","wsh","jar","sh","apk","app","jse","js","mjs"
];
const DEFAULT_MAX_MB = 25;

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadSecureFile(file: File, opts: { maxMb?: number } = {}): Promise<{
  path: string; verdict: "allow" | "warn"; sha: string;
}> {
  const maxBytes = (opts.maxMb ?? DEFAULT_MAX_MB) * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(`File exceeds ${opts.maxMb ?? DEFAULT_MAX_MB} MB limit`);

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (HARD_BLOCK_EXT.includes(ext)) throw new Error(`.${ext} files are not allowed`);

  const verdict = await scanFile(file);
  if (verdict.action === "block" || verdict.action === "quarantine") {
    throw new Error(`Upload blocked: ${verdict.reason}`);
  }

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const sha = await sha256(file);
  const path = `${u.user.id}/${Date.now()}-${sha.slice(0, 12)}-${file.name}`;
  const { error: upErr } = await supabase.storage.from("secure-uploads").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) throw upErr;

  await supabase.from("secure_file_uploads").insert({
    uploaded_by: u.user.id,
    storage_path: path,
    filename: file.name,
    size_bytes: file.size,
    mime_type: file.type || null,
    sniffed_mime: (verdict.extra as any)?.sniffed_mime ?? null,
    sha256: sha,
    scan_action: verdict.action,
    scan_reason: verdict.reason,
  });

  return { path, verdict: verdict.action as "allow" | "warn", sha };
}
