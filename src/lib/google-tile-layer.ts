import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PROXY_URL = `${SUPABASE_URL}/functions/v1/maps-tile-proxy`;

/**
 * Authenticated Google Maps tile layer.
 * Tiles are fetched via the maps-tile-proxy edge function so the API key
 * never reaches the browser. Each tile request includes the user JWT.
 */
const AuthGoogleLayer = L.GridLayer.extend({
  options: { view: "streets", maxZoom: 22, attribution: "&copy; Google" },

  createTile: function (coords: { x: number; y: number; z: number }, done: (err: Error | null, tile: HTMLElement) => void) {
    const tile = document.createElement("img") as HTMLImageElement;
    tile.alt = "";
    tile.setAttribute("role", "presentation");

    const TRANSPARENT_PX =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    const reportFailure = (reason: string) => {
      try {
        window.dispatchEvent(
          new CustomEvent("google-tiles-failed", { detail: { view: this.options.view, reason } }),
        );
      } catch { /* ignore */ }
    };

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");
        const url = `${PROXY_URL}?view=${this.options.view}&z=${coords.z}&x=${coords.x}&y=${coords.y}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          reportFailure(`http_${res.status}`);
          tile.src = TRANSPARENT_PX;
          done(null, tile);
          return;
        }
        // Edge function returns a transparent PNG with X-Tile-Fallback: 1
        // when Google's API rejects the request (e.g. SERVICE_DISABLED).
        if (res.headers.get("X-Tile-Fallback") === "1") {
          reportFailure("api_disabled");
          tile.src = TRANSPARENT_PX;
          done(null, tile);
          return;
        }
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        tile.onload = () => { URL.revokeObjectURL(objUrl); done(null, tile); };
        tile.onerror = () => {
          URL.revokeObjectURL(objUrl);
          reportFailure("decode_error");
          tile.src = TRANSPARENT_PX;
          done(null, tile);
        };
        tile.src = objUrl;
      } catch (e) {
        reportFailure((e as Error).message ?? "exception");
        tile.src = TRANSPARENT_PX;
        done(null, tile);
      }
    })();

    return tile;
  },
});

export function createGoogleLayer(view: "streets" | "satellite" | "hybrid" | "terrain") {
  // @ts-expect-error Leaflet extend typing
  return new AuthGoogleLayer({ view, maxZoom: 22 });
}
