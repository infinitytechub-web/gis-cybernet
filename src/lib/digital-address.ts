// Captures a digital address for attendance: device geolocation + reverse-geocode.
// Returns null fields on any failure (denied permission, timeout, offline, etc.)
// so callers can store partial data without blocking check-in/out.

import { supabase } from "@/integrations/supabase/client";

export type DigitalAddress = {
  lat: number | null;
  lng: number | null;
  address: string | null;
};

const EMPTY: DigitalAddress = { lat: null, lng: null, address: null };

function getPosition(timeoutMs = 8000): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (p: GeolocationPosition | null) => {
      if (settled) return;
      settled = true;
      resolve(p);
    };
    navigator.geolocation.getCurrentPosition(
      (p) => done(p),
      () => done(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
    // hard fallback in case the browser never fires either callback
    setTimeout(() => done(null), timeoutMs + 500);
  });
}

export async function captureDigitalAddress(): Promise<DigitalAddress> {
  try {
    const pos = await getPosition();
    if (!pos) return EMPTY;
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    let address: string | null = null;
    try {
      const { data, error } = await supabase.functions.invoke("reverse-geocode", {
        body: { lat, lng },
      });
      if (!error && data && typeof (data as any).address === "string") {
        address = (data as any).address;
      } else {
        address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    } catch {
      address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }

    return { lat, lng, address };
  } catch {
    return EMPTY;
  }
}
