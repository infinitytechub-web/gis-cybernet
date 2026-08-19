import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KpiTileProps {
  title: string;
  value: number | string;
  sub?: string;
  icon: LucideIcon;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  onClick?: () => void;
}

const TONES: Record<NonNullable<KpiTileProps["tone"]>, string> = {
  neutral: "border-border bg-card text-foreground",
  info: "border-info/30 bg-info/5 text-info",
  success: "border-success/30 bg-success/5 text-success",
  warning: "border-warning/30 bg-warning/5 text-warning",
  danger: "border-destructive/30 bg-destructive/5 text-destructive",
};

/** One key figure. Same shape everywhere so the hierarchy reads consistently. */
export function KpiTile({ title, value, sub, icon: Icon, tone = "neutral", onClick }: KpiTileProps) {
  const body = (
    <Card className={cn("h-full border-2 transition-colors", TONES[tone], onClick && "hover:border-primary/60")}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );

  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} className="min-h-[44px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
      {body}
    </button>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{children}</div>;
}

export default KpiTile;
