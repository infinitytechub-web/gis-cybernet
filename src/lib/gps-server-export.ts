/**
 * Server-side paginated export for the GPS Hub.
 *
 * Streams the full filtered set from `public.get_gps_points` in pages of 500
 * using a `(created_at < cursor)` keyset, then hands the accumulated rows to
 * the existing `exportReport` formatter. This bypasses the 500-row-per-source
 * client cache so commanders can download the full filtered history.
 *
 * A 5,000-row safety ceiling protects the browser from runaway exports.
 */
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { exportReport, type ExportFormat } from "@/lib/export-utils";

export const GPS_EXPORT_PAGE_SIZE = 500;
export const GPS_EXPORT_MAX_ROWS = 5000;

export type GpsExportSource = "operations" | "enforcement_operations" | "cyber_incidents";

const SOURCE_LABEL: Record<string, string> = {
  operations: "Operations",
  enforcement_operations: "Enforcement",
  cyber_incidents: "Cyber Incidents",
};

export interface GpsExportFilters {
  /** Subset of source tables. Empty / undefined = all sources. */
  sources?: GpsExportSource[];
  /** ISO timestamp lower bound (inclusive). */
  from?: string | null;
  /** ISO timestamp upper bound (inclusive). */
  to?: string | null;
}

export interface GpsExportProgress {
  fetched: number;
  done: boolean;
}

interface ServerGpsRow {
  source: string;
  id: string;
  location: string | null;
  label: string | null;
  reference: string | null;
  status: string | null;
  created_at: string;
}

/** Parse "(lat, lng)" coordinates the same way the page does. */
function parseCoords(raw: string | null): { lat: number | null; lng: number | null } {
  if (!raw) return { lat: null, lng: null };
  const m = raw.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
  if (!m) return { lat: null, lng: null };
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

/**
 * Fetch every matching GPS point from the server, paged by `created_at`.
 * Honours the GPS_EXPORT_MAX_ROWS safety ceiling.
 */
export async function fetchAllGpsPoints(
  filters: GpsExportFilters,
  onProgress?: (p: GpsExportProgress) => void,
): Promise<ServerGpsRow[]> {
  const collected: ServerGpsRow[] = [];
  // Keyset cursor — we narrow `_to` on each page so the next call returns
  // strictly older rows. The RPC orders by created_at DESC.
  let cursor: string | null = filters.to ?? null;
  // Track the smallest id seen at the cursor boundary so we don't re-emit
  // duplicate rows that share the exact cursor timestamp.
  const seenIds = new Set<string>();

  while (collected.length < GPS_EXPORT_MAX_ROWS) {
    const { data, error } = await supabase.rpc("get_gps_points", {
      _sources: filters.sources && filters.sources.length > 0 ? filters.sources : null,
      _from: filters.from ?? null,
      _to: cursor,
      _limit: GPS_EXPORT_PAGE_SIZE,
    });
    if (error) throw error;
    const rows = (data ?? []) as ServerGpsRow[];
    if (rows.length === 0) break;

    let appended = 0;
    for (const r of rows) {
      if (seenIds.has(r.id)) continue;
      collected.push(r);
      seenIds.add(r.id);
      appended++;
      if (collected.length >= GPS_EXPORT_MAX_ROWS) break;
    }

    onProgress?.({ fetched: collected.length, done: false });

    // Stop if the page wasn't full (no more older rows) OR if we made no
    // forward progress (entire page was duplicates of the previous boundary).
    if (rows.length < GPS_EXPORT_PAGE_SIZE || appended === 0) break;

    // Advance cursor to the oldest row we just received.
    const oldest = rows[rows.length - 1];
    cursor = oldest.created_at;
  }

  onProgress?.({ fetched: collected.length, done: true });
  return collected;
}

/**
 * Build the export rows + headers from a server-streamed result set.
 * Matches the client `buildExport` shape so PDFs and CSVs look identical.
 */
function buildOptions(rows: ServerGpsRow[], filters: GpsExportFilters) {
  const headers = ["GPS Address", "Latitude", "Longitude", "Source", "Context", "Reference", "Status", "Captured"];
  const dataRows = rows.map((r) => {
    const c = parseCoords(r.location);
    return [
      r.location ?? "",
      c.lat != null ? c.lat.toFixed(6) : "",
      c.lng != null ? c.lng.toFixed(6) : "",
      SOURCE_LABEL[r.source] ?? r.source,
      (r.label ?? "").replace(/_/g, " "),
      r.reference ?? "",
      r.status ?? "",
      format(new Date(r.created_at), "dd MMM yyyy, HH:mm"),
    ];
  });

  const filterParts: string[] = [];
  if (filters.sources && filters.sources.length > 0) {
    filterParts.push(`Sources: ${filters.sources.map((s) => SOURCE_LABEL[s] ?? s).join(", ")}`);
  }
  if (filters.from) filterParts.push(`From: ${format(new Date(filters.from), "dd MMM yyyy")}`);
  if (filters.to) filterParts.push(`To: ${format(new Date(filters.to), "dd MMM yyyy")}`);

  const cappedNote = rows.length >= GPS_EXPORT_MAX_ROWS
    ? ` · capped at ${GPS_EXPORT_MAX_ROWS.toLocaleString()} rows`
    : "";
  const subtitle = `GPS Hub server export · ${rows.length.toLocaleString()} rows${filterParts.length ? ` · ${filterParts.join(" · ")}` : ""}${cappedNote}`;

  return {
    title: "GPS Hub — Server Export",
    filename: `gps_hub_server_${format(new Date(), "yyyyMMdd_HHmm")}`,
    headers,
    rows: dataRows,
    subtitle,
  };
}

/**
 * High-level: stream the full server-paginated set, then export as CSV/PDF.
 * Throws on any RPC error so the caller can surface a toast.
 */
export async function exportGpsPointsServerSide(
  fmt: ExportFormat,
  filters: GpsExportFilters,
  onProgress?: (p: GpsExportProgress) => void,
): Promise<{ rowCount: number; capped: boolean }> {
  const rows = await fetchAllGpsPoints(filters, onProgress);
  exportReport(fmt, buildOptions(rows, filters));
  return { rowCount: rows.length, capped: rows.length >= GPS_EXPORT_MAX_ROWS };
}
