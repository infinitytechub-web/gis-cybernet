import { Crosshair, MapPin, Lock } from "lucide-react";

interface StaticCoordinateMapProps {
  lat: number;
  lng: number;
  label?: string;
  height?: number;
}

/**
 * Offline / neutral coordinate display.
 *
 * Renders a static SVG grid with the target coordinates plotted at the centre
 * — NO online tile servers are contacted. This is the fallback shown to
 * operators who have not (yet) been granted online-tracking authorization, so
 * they can still read and copy the captured coordinates without any third-party
 * network request being made on their behalf.
 *
 * Pure SVG + design-token colors; safe to render in any auth context.
 */
export function StaticCoordinateMap({ lat, lng, label, height = 320 }: StaticCoordinateMapProps) {
  // Use a fixed viewBox so grid spacing stays consistent regardless of pixel height.
  const W = 600;
  const H = 360;
  const gridStep = 30;

  // Decimal portion drives a subtle crosshair offset so different coordinates
  // visibly land at slightly different spots on the static grid.
  const fracLat = Math.abs(lat - Math.trunc(lat));
  const fracLng = Math.abs(lng - Math.trunc(lng));
  const cx = W / 2 + (fracLng - 0.5) * 60;
  const cy = H / 2 + (fracLat - 0.5) * 60;

  const gridLinesX: number[] = [];
  for (let x = 0; x <= W; x += gridStep) gridLinesX.push(x);
  const gridLinesY: number[] = [];
  for (let y = 0; y <= H; y += gridStep) gridLinesY.push(y);

  return (
    <div
      className="w-full rounded-md overflow-hidden border bg-muted/30 relative"
      style={{ height }}
      role="img"
      aria-label={`Static offline coordinate map: ${lat.toFixed(6)}, ${lng.toFixed(6)}`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        {/* Backdrop */}
        <rect x="0" y="0" width={W} height={H} fill="hsl(var(--muted))" />

        {/* Grid lines */}
        {gridLinesX.map((x) => (
          <line
            key={`gx-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={H}
            stroke="hsl(var(--border))"
            strokeWidth={0.5}
          />
        ))}
        {gridLinesY.map((y) => (
          <line
            key={`gy-${y}`}
            x1={0}
            y1={y}
            x2={W}
            y2={y}
            stroke="hsl(var(--border))"
            strokeWidth={0.5}
          />
        ))}

        {/* Centre cross axes */}
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="4 4" />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="4 4" />

        {/* Plotted point with concentric rings */}
        <circle cx={cx} cy={cy} r={26} fill="hsl(var(--primary) / 0.10)" stroke="hsl(var(--primary) / 0.35)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={14} fill="hsl(var(--primary) / 0.20)" stroke="hsl(var(--primary) / 0.55)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={6} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />

        {/* Coordinate readout panel */}
        <g>
          <rect
            x={12}
            y={H - 56}
            width={260}
            height={44}
            rx={6}
            fill="hsl(var(--card))"
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
          <text x={22} y={H - 36} fontSize="11" fontFamily="monospace" fill="hsl(var(--foreground))">
            lat {lat.toFixed(6)}
          </text>
          <text x={22} y={H - 20} fontSize="11" fontFamily="monospace" fill="hsl(var(--foreground))">
            lng {lng.toFixed(6)}
          </text>
        </g>

        {/* Offline badge */}
        <g>
          <rect
            x={W - 132}
            y={12}
            width={120}
            height={22}
            rx={11}
            fill="hsl(var(--card))"
            stroke="hsl(var(--border))"
          />
          <text x={W - 72} y={27} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">
            OFFLINE · NO TILES
          </text>
        </g>
      </svg>

      {/* Overlay label + lock indicator */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-card/90 backdrop-blur px-2 py-1 border text-[11px] shadow-sm">
        <Lock className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">Static coordinate view</span>
      </div>
      {label && (
        <div className="absolute bottom-2 right-2 max-w-[55%] rounded-md bg-card/90 backdrop-blur px-2 py-1 border text-[11px] shadow-sm flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-primary shrink-0" />
          <span className="truncate">{label}</span>
        </div>
      )}
      {/* Tiny crosshair badge for visual continuity with live map */}
      <div className="absolute top-2 right-[152px] hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground">
        <Crosshair className="h-3 w-3" />
      </div>
    </div>
  );
}

export default StaticCoordinateMap;
