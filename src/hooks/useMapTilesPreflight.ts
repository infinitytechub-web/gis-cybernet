import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
// Include dummy z/x/y so even an older deployment of the proxy (without the
// preflight branch) does not 400 on parameter validation.
const PREFLIGHT_URL = `${SUPABASE_URL}/functions/v1/maps-tile-proxy?preflight=1&view=streets&z=0&x=0&y=0`;

export type TilesPreflight =
  | { status: "loading" }
  | { status: "ok" }
  | {
      status: "error";
      reason: "missing_key" | "api_disabled" | "key_blocked" | "unknown" | "network";
      message: string;
      detail?: string;
    };

/**
 * Pings the Google Map Tiles API once via the proxy to detect whether
 * tiles are reachable. Returns a status + human-readable message that
 * the UI can surface in a banner. Result is cached for the session.
 */
const cache: { value?: TilesPreflight } = {};

export function useMapTilesPreflight() {
  const [state, setState] = useState<TilesPreflight>(
    cache.value ?? { status: "loading" },
  );

  useEffect(() => {
    if (cache.value && cache.value.status !== "loading") return;
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Without auth we cannot verify; treat as ok and let tiles fall back.
          const v: TilesPreflight = { status: "ok" };
          cache.value = v;
          if (!cancelled) setState(v);
          return;
        }
        const res = await fetch(PREFLIGHT_URL, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const ctype = res.headers.get("Content-Type") ?? "";
        let v: TilesPreflight;
        if (ctype.startsWith("image/")) {
          // Old proxy deployment: it ignored ?preflight=1 and returned a tile.
          // If it's a real tile (no fallback header) we treat tiles as healthy.
          const fallback = res.headers.get("X-Tile-Fallback") === "1";
          v = fallback
            ? { status: "error", reason: "api_disabled", message: "Google Map Tiles API appears disabled. Using fallback layers." }
            : { status: "ok" };
        } else {
          const body = await res.json().catch(() => ({}));
          if (res.ok && body?.ok) {
            v = { status: "ok" };
          } else {
            v = {
              status: "error",
              reason: body?.reason ?? "unknown",
              message: body?.message ?? body?.error ?? "Google tile service is unavailable.",
              detail: body?.detail,
            };
          }
        }
        cache.value = v;
        if (!cancelled) setState(v);
      } catch (e) {
        const v: TilesPreflight = {
          status: "error",
          reason: "network",
          message: "Could not reach the tile service. Using fallback layers.",
          detail: (e as Error).message,
        };
        cache.value = v;
        if (!cancelled) setState(v);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return state;
}
