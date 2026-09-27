import { type LucideIcon, ArrowDownRight, ArrowUpRight, Minus, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KpiAlert { level: "warning" | "danger"; text: string }

export interface KpiTileProps {
  title: string;
  value: number | string;
  sub?: string;
  icon: LucideIcon;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  onClick?: () => void;
  /** Category accent 1–8 (consistent colour per command/department). */
  accent?: number;
  /** Change versus the comparison period; null/undefined hides the indicator. */
  trend?: number | null;
  trendLabel?: string;
  /** Automatic alert — recolours the card and shows the reason. */
  alert?: KpiAlert | null;
  selected?: boolean;
}

const TONES: Record<NonNullable<KpiTileProps["tone"]>, string> = {
  neutral: "border-border bg-card text-foreground",
  info: "border-info/30 bg-info/5 text-info",
  success: "border-success/30 bg-success/5 text-success",
  warning: "border-warning/40 bg-warning/5 text-warning",
  danger: "border-destructive/40 bg-destructive/5 text-destructive",
};

/** Stable accent index for a name, so a command keeps its colour everywhere. */
export function accentFor(key: string | null | undefined): number {
  let h = 0;
  for (const ch of key ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 8) + 1;
}

/** One key figure. Same shape everywhere so the hierarchy reads consistently. */
export function KpiTile({ title, value, sub, icon: Icon, tone = "neutral", onClick, accent, trend, trendLabel = "vs last week", alert, selected }: KpiTileProps) {
  const effTone = alert ? alert.level : tone;
  const accentColor = accent ? `hsl(var(--cat-${accent}))` : undefined;
  const TrendIcon = trend == null ? null : trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const body = (
    <Card
      className={cn(
        "relative h-full overflow-hidden border-2 transition-all",
        TONES[effTone],
        onClick && "hover:-translate-y-0.5 hover:shadow-md hover:border-primary/60",
        selected && "ring-2 ring-primary ring-offset-1",
      )}
    >
      {accentColor && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: accentColor }} />}
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground line-clamp-2">{title}</CardTitle>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={accentColor ? { background: `hsl(var(--cat-${accent}) / 0.12)`, color: accentColor } : undefined}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
          {TrendIcon && (
            <span
              className={cn(
                "inline-flex items-center text-[11px] font-medium tabular-nums",
                trend! > 0 ? "text-success" : trend! < 0 ? "text-destructive" : "text-muted-foreground",
              )}
              title={trendLabel}
            >
              <TrendIcon className="h-3 w-3" aria-hidden="true" />
              {trend! > 0 ? "+" : ""}{trend}
              <span className="sr-only"> {trendLabel}</span>
            </span>
          )}
        </div>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        {alert && (
          <p className={cn("mt-1 flex items-center gap-1 text-[10px] font-medium", alert.level === "danger" ? "text-destructive" : "text-warning")}>
            <AlertTriangle className="h-3 w-3 animate-pulse" aria-hidden="true" /> {alert.text}
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="min-h-[44px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
      {body}
    </button>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{children}</div>;
}

export default KpiTile;
