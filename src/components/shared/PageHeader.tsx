import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — compact theme-linked heading used at the top of major pages.
 *
 * Spacing rules (enforced here so it can't drift across pages):
 *  - Compact spacing keeps dashboards focused on records and figures.
 *  - The icon drives the row height, so titles render at the same
 *    vertical position whether or not a subtitle is present.
 *  - Subtitle <p> is only rendered when `subtitle` is a non-empty string,
 *    which prevents leftover empty paragraphs from creating phantom gaps.
 */
export interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  /** Legacy compatibility; shared theme surfaces take precedence. */
  gradientClassName?: string;
  /** Optional right-aligned actions (buttons, badges, etc.). */
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

const DEFAULT_GRADIENT =
  "border-primary/40 bg-card text-card-foreground";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  gradientClassName: _legacyGradient,
  actions,
  className,
  ...rest
}: PageHeaderProps) {
  const trimmed = subtitle?.trim();
  return (
    <div
      data-testid={rest["data-testid"] ?? "page-header"}
      className={cn(
        "relative rounded-lg border px-3 py-2.5 sm:px-4 shadow-sm",
        DEFAULT_GRADIENT,
        className,
      )}
    >
      <div className="relative flex items-center gap-3 flex-wrap">
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-snug">{title}</h1>
          {trimmed ? (
            <p className="text-xs text-muted-foreground mt-0.5">{trimmed}</p>
          ) : null}
        </div>
        {actions ? <div className="relative ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
