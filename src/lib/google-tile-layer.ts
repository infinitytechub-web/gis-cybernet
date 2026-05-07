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

    // 1x1 transparent PNG fallback so a misconfigured Google Tiles API
    // (e.g. SERVICE_DISABLED) does not blank the map or spam runtime errors.
    const TRANSPARENT_PX =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");
        const url = `${PROXY_URL}?view=${this.options.view}&z=${coords.z}&x=${coords.x}&y=${coords.y}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          // Swallow proxy errors quietly — switch to a fallback layer instead.
          tile.src = TRANSPARENT_PX;
          done(null, tile);
          return;
        }
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        tile.onload = () => { URL.revokeObjectURL(objUrl); done(null, tile); };
        tile.onerror = () => {
          URL.revokeObjectURL(objUrl);
          tile.src = TRANSPARENT_PX;
          done(null, tile);
        };
        tile.src = objUrl;
      } catch {
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
