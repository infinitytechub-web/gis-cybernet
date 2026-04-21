import * as React from "react";
import { Navigation, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * Ghana Post GPS digital address format: 2-letter region + 3 digits + 4 digits.
 * Examples: GA-123-4567, AK-005-1234, GS-999-0001
 *
 * This component is the single source of truth for capturing a GPS address
 * across Enforcement, Operations and any other module that stores a location
 * in the database. Both the manual digital-address input and the live
 * "Get GPS Address" button emit the same normalized string into one callback,
 * so callers only need to wire `location` (or whatever field) to `onAddress`.
 */

const DIGITAL_RE = /^[A-Z]{2}-\d{3}-\d{4}$/;

export function normalizeDigitalAddress(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidDigitalAddress(input: string): boolean {
  return DIGITAL_RE.test(normalizeDigitalAddress(input));
}

interface GhanaGPSInputProps {
  /** Called with the canonical GPS address string ready to store. */
  onAddress: (addr: string) => void;
  /** Optional placeholder for the digital-address input. */
  placeholder?: string;
}

export function GhanaGPSInput({ onAddress, placeholder }: GhanaGPSInputProps) {
  const [digital, setDigital] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const submitManual = () => {
    const code = normalizeDigitalAddress(digital);
    if (!isValidDigitalAddress(code)) {
      toast.error("Enter a valid digital address, e.g. GA-123-4567");
      return;
    }
    onAddress(code);
    toast.success(`Digital address ${code} applied`);
    setDigital("");
  };

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by your browser");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const latStr = Math.abs(latitude).toFixed(4).replace(".", "");
        const lngStr = Math.abs(longitude).toFixed(4).replace(".", "");
        const regionCode = latitude >= 5.5 ? "GA" : latitude >= 5.0 ? "AK" : "GS";
        const digitAddr = `${regionCode}-${latStr.slice(0, 3)}-${lngStr.slice(0, 4)}`;
        const gpsAddr = `${digitAddr} (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
        onAddress(gpsAddr);
        setLoading(false);
        toast.success("GPS address captured");
      },
      (err) => {
        setLoading(false);
        toast.error(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
      <div className="flex flex-1 gap-1.5">
        <Input
          value={digital}
          onChange={(e) => setDigital(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitManual();
            }
          }}
          placeholder={placeholder ?? "Digital address (e.g. GA-123-4567)"}
          className="h-8 text-xs uppercase tracking-wide"
          maxLength={11}
          aria-label="Ghana Post digital address"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 text-xs shrink-0"
          onClick={submitManual}
          disabled={!digital.trim()}
        >
          <MapPin className="h-3 w-3" />
          Use
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1 text-xs shrink-0"
        onClick={captureGPS}
        disabled={loading}
      >
        <Navigation className="h-3 w-3" />
        {loading ? "Getting GPS..." : "Get GPS Address"}
      </Button>
    </div>
  );
}

export default GhanaGPSInput;
