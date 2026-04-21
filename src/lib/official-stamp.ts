/**
 * Helpers for stamping exported intel artefacts (PDFs / printouts) with the
 * viewer's official identity and a tamper-evident QR code that links back to
 * the audit-trail entry for the export/print event.
 *
 * - `buildOfficialWatermark` returns a single-line string suitable for
 *   diagonal watermarking ("RANK NAME · DEPARTMENT · GIS CYBERNET · OFFICIAL").
 * - `buildAuditQrDataUrl` renders a QR image (PNG data URL) that encodes a
 *   verification URL pointing at the audit log entry.
 *
 * `qrcode` is a tiny dependency (~30KB) chosen because it works in both the
 * browser and Node, with no Canvas DOM requirement (uses its own renderer).
 */
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  oic: "Command OIC",
  "2ic": "Command 2IC",
  staff_officer: "Staff Officer",
  supervisor: "Supervisor",
  ipse_supervisor: "IPSE Supervisor",
  ipse_deputy_supervisor: "IPSE Deputy Supervisor",
  shift_supervisor: "Shift Supervisor",
  deputy_shift_supervisor: "Deputy Shift Supervisor",
  shift_leader: "Shift Leader",
  deputy_supervisor: "Deputy Supervisor",
  deputy_shift_leader: "Deputy Shift Leader",
  special_duties: "Special Duties",
  deputy: "Deputy",
  front_desk: "Front Desk",
  staff: "Staff",
};

export interface ViewerStamp {
  fullName: string;
  staffId: string | null;
  roleLabel: string;
  department: string;
}

/**
 * Fetch the viewer's display name, staff ID and department in a single round
 * trip. Falls back to safe placeholders if any field is missing so the
 * watermark always renders (an unstamped PDF would be a bigger compliance
 * problem than an "Unknown Department" stamp).
 */
export async function fetchViewerStamp(userId: string, role: string | null): Promise<ViewerStamp> {
  let fullName = "Unknown Officer";
  let staffId: string | null = null;
  let department = "Unassigned Department";
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, staff_id, department_id")
      .eq("id", userId)
      .maybeSingle();
    if (profile) {
      const fn = (profile.first_name ?? "").trim();
      const ln = (profile.last_name ?? "").trim();
      if (fn || ln) fullName = `${fn} ${ln}`.trim();
      staffId = profile.staff_id ?? null;
      if (profile.department_id) {
        const { data: dept } = await supabase
          .from("departments")
          .select("name")
          .eq("id", profile.department_id)
          .maybeSingle();
        if (dept?.name) department = dept.name;
      }
    }
  } catch {
    // Swallow — we still want to return a usable stamp.
  }
  const roleLabel = role ? ROLE_LABELS[role] ?? role : "Staff";
  return { fullName, staffId, roleLabel, department };
}

/**
 * Compose the diagonal watermark text rendered across embedded snapshots and
 * every PDF page. Includes role + department per the operational requirement
 * that exported intel be traceable back to the authorising officer.
 */
export function buildOfficialWatermark(stamp: ViewerStamp): string {
  const parts = [
    `${stamp.roleLabel} · ${stamp.fullName}`.trim(),
    stamp.department,
    stamp.staffId ? `STAFF ${stamp.staffId}` : null,
    "GIS CYBERNET · OFFICIAL USE",
  ].filter(Boolean);
  return parts.join("  ·  ");
}

/**
 * Render a QR code (PNG data URL) encoding a verification URL. The URL points
 * back into Cybernet so that scanning the printed/exported document opens the
 * audit record and confirms the export's authorisation timestamp.
 */
export async function buildAuditQrDataUrl(verificationUrl: string): Promise<string> {
  return QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

/**
 * Convenience: build the canonical verification URL for an audit log row.
 */
export function buildAuditVerificationUrl(auditId: string, authorizedAt: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://gis-cybernet.lovable.app";
  const params = new URLSearchParams({ audit: auditId, ts: authorizedAt });
  return `${origin}/gps-addresses?${params.toString()}`;
}
