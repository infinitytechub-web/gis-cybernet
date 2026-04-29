// Lightweight device fingerprint (non-PII): hash of UA + platform + screen + tz
export async function getDeviceFingerprint(): Promise<string> {
  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      (navigator as any).platform || "",
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      String(navigator.hardwareConcurrency || ""),
    ].join("|");
    const buf = new TextEncoder().encode(parts);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}
