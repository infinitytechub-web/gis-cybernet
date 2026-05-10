import { supabase } from "@/integrations/supabase/client";

let cachedIp: string | null = null;
let ipPromise: Promise<string | null> | null = null;

async function getClientIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  if (ipPromise) return ipPromise;
  ipPromise = (async () => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const res = await fetch("https://api.ipify.org?format=json", { signal: ctl.signal });
      clearTimeout(t);
      const j = await res.json();
      cachedIp = j?.ip ?? null;
      return cachedIp;
    } catch {
      return null;
    }
  })();
  return ipPromise;
}

export type FileAuditAction = "upload" | "download" | "preview" | "permission_change" | "delete";

export async function logFileAudit(
  fileId: string | null,
  action: FileAuditAction,
  metadata: Record<string, unknown> = {},
) {
  try {
    const ip = await getClientIp();
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    await supabase.rpc("log_announcement_file_audit", {
      _file_id: fileId,
      _action: action,
      _ip: ip,
      _user_agent: ua,
      _metadata: metadata as any,
    });
  } catch {
    // Silent — audit logging must not block UX
  }
}
