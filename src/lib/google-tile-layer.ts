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

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");
        const url = `${PROXY_URL}?view=${this.options.view}&z=${coords.z}&x=${coords.x}&y=${coords.y}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(`Tile ${res.status}`);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        tile.onload = () => { URL.revokeObjectURL(objUrl); done(null, tile); };
        tile.onerror = () => { URL.revokeObjectURL(objUrl); done(new Error("img load"), tile); };
        tile.src = objUrl;
      } catch (e) {
        done(e as Error, tile);
      }
    })();

    return tile;
  },
});

export function createGoogleLayer(view: "streets" | "satellite" | "hybrid" | "terrain") {
  // @ts-expect-error Leaflet extend typing
  return new AuthGoogleLayer({ view, maxZoom: 22 });
}
