import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared deep-cyan + white hero used across security-related pages
 * (Quarantine, Sensitive Access Log, IP Blocks, Audit Log, Command Roles,
 * Route History, Verify Export, etc.) so they share a consistent theme.
 *
 * Deep cyan token: HSL 195 85% 30%.
 */
export interface SecurityHeroProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  actions?: React.ReactNode;
  className?: string;
}

const GRADIENT =
  "border-cyan-200/30 bg-gradient-to-r from-[hsl(195_85%_22%)] via-[hsl(195_85%_30%)] to-[hsl(190_70%_42%)]";

export function SecurityHero({ icon: Icon, title, subtitle, actions, className }: SecurityHeroProps) {
  const trimmed = subtitle?.trim();
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-5 shadow-md",
        GRADIENT,
        className,
      )}
    >
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
      <div className="relative flex items-center gap-3 flex-wrap">
        <div className="rounded-lg bg-white/15 backdrop-blur p-2.5 ring-1 ring-white/25">
          <Icon className="h-7 w-7 text-white" />
        </div>
        <div className="text-white min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight leading-tight">{title}</h1>
          {trimmed ? <p className="text-xs text-white/85 mt-0.5">{trimmed}</p> : null}
        </div>
        {actions ? <div className="relative ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Cyan outline button class — pair with shadcn Button variant="outline". */
export const securityButtonClass =
  "border-[hsl(195_85%_30%)] text-[hsl(195_85%_24%)] hover:bg-[hsl(195_85%_30%)] hover:text-white dark:text-cyan-200 dark:border-cyan-500/40";

/** Solid cyan button class — pair with default Button. */
export const securityButtonSolidClass =
  "bg-[hsl(195_85%_30%)] text-white hover:bg-[hsl(195_85%_24%)]";
