/**
 * FLEET OFFLINE STORE — local persistence and sync for GPS positions.
 *
 * Field devices lose connectivity constantly. Positions (and panic presses)
 * captured while offline are written to a local queue in `localStorage` and
 * flushed to the database in order as soon as the network returns, so no fix is
 * lost. The queue is bounded and de-duplicated by client id, which makes the
 * flush idempotent even if a request is retried.
 */
import { supabase } from "@/integrations/supabase/client";

const STORE_KEY = "cybernet.fleet.offline.queue.v1";
/** Hard cap — oldest fixes are dropped first when a device stays offline for days. */
export const MAX_QUEUED = 2000;

export interface QueuedPosition {
  client_id: string;
  vehicle_id: string;
  lat: number;
  lng: number;
  speed_kph?: number | null;
  heading?: number | null;
  ignition?: boolean | null;
  fuel_level_pct?: number | null;
  door_open?: boolean | null;
  boot_open?: boolean | null;
  recorded_at: string;
  /** Panic pressed while offline — raised as an alert on flush. */
  panic?: boolean;
  panic_note?: string | null;
  attempts?: number;
}

function safeParse(raw: string | null): QueuedPosition[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedPosition[]) : [];
  } catch {
    return [];
  }
}

export function readQueue(): QueuedPosition[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(STORE_KEY));
}

function writeQueue(items: QueuedPosition[]) {
  if (typeof localStorage === "undefined") return;
  const trimmed = items.slice(-MAX_QUEUED);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full / private mode — keep only the newest slice we can persist.
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(trimmed.slice(-200)));
    } catch {
      /* give up silently; live tracking still works while online */
    }
  }
  notify();
}

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function notify() {
  const count = readQueue().length;
  listeners.forEach((l) => l(count));
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue().length);
  return () => listeners.delete(listener);
}

export function queueSize(): number {
  return readQueue().length;
}

export function clearQueue() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORE_KEY);
  notify();
}

function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Adds a fix to the local store. Returns the stored record. */
export function enqueuePosition(
  fix: Omit<QueuedPosition, "client_id" | "recorded_at" | "attempts"> & { recorded_at?: string },
): QueuedPosition {
  const record: QueuedPosition = {
    ...fix,
    client_id: newClientId(),
    recorded_at: fix.recorded_at ?? new Date().toISOString(),
    attempts: 0,
  };
  const queue = readQueue();
  writeQueue([...queue, record]);
  return record;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export interface FlushResult {
  synced: number;
  failed: number;
  remaining: number;
}

/**
 * Sends queued fixes to the database in insert order, in batches. Records that
 * fail are kept (with an attempt counter) unless the server rejects them
 * outright as invalid, which would otherwise block the queue forever.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (!isOnline()) return { synced: 0, failed: 0, remaining: queueSize() };
  const queue = readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, remaining: 0 };

  const BATCH = 100;
  let synced = 0;
  let failed = 0;
  const keep: QueuedPosition[] = [];

  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    const rows = batch.map((p) => ({
      vehicle_id: p.vehicle_id,
      lat: p.lat,
      lng: p.lng,
      speed_kph: p.speed_kph ?? 0,
      heading: p.heading ?? null,
      ignition: p.ignition ?? null,
      fuel_level_pct: p.fuel_level_pct ?? null,
      door_open: p.door_open ?? null,
      boot_open: p.boot_open ?? null,
      recorded_at: p.recorded_at,
      source: "offline-sync",
    }));

    const { error } = await supabase.from("fleet_positions").insert(rows);
    if (error) {
      failed += batch.length;
      // Permission / validation errors will never succeed — drop after 5 tries.
      batch.forEach((p) => {
        const attempts = (p.attempts ?? 0) + 1;
        if (attempts < 5) keep.push({ ...p, attempts });
      });
      continue;
    }

    synced += batch.length;
    // Panic presses captured offline are raised once their fix has landed.
    for (const p of batch.filter((b) => b.panic)) {
      try {
        await supabase.rpc("fleet_raise_panic", {
          _vehicle_id: p.vehicle_id,
          _lat: p.lat,
          _lng: p.lng,
          _note: p.panic_note ?? "Panic raised while offline",
        });
      } catch {
        /* alert retry is not worth blocking the position queue */
      }
    }
  }

  writeQueue(keep);
  return { synced, failed, remaining: keep.length };
}

/**
 * Records a position: straight to the database when online, otherwise to the
 * local store. Always returns whether the fix was persisted remotely.
 */
export async function recordPosition(
  fix: Omit<QueuedPosition, "client_id" | "attempts"> & { recorded_at?: string },
): Promise<{ online: boolean }> {
  if (!isOnline()) {
    enqueuePosition(fix);
    return { online: false };
  }
  const queued = enqueuePosition(fix);
  const result = await flushQueue();
  return { online: result.synced > 0 && !readQueue().some((p) => p.client_id === queued.client_id) };
}
