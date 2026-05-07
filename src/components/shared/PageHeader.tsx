import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — branded gradient hero used at the top of major pages.
 *
 * Spacing rules (enforced here so it can't drift across pages):
 *  - Outer container always has p-5 (consistent vertical breathing room).
 *  - The icon (h-7) drives the row height, so titles render at the same
 *    vertical position whether or not a subtitle is present.
 *  - Subtitle <p> is only rendered when `subtitle` is a non-empty string,
 *    which prevents leftover empty paragraphs from creating phantom gaps.
 */
export interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  /** Override gradient classes (e.g. for IPSE). Defaults to emerald hero. */
  gradientClassName?: string;
  /** Optional right-aligned actions (buttons, badges, etc.). */
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

const DEFAULT_GRADIENT =
  "border-emerald-700/20 bg-gradient-to-r from-emerald-900 via-emerald-700 to-teal-600";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  gradientClassName,
  actions,
  className,
  ...rest
}: PageHeaderProps) {
  const trimmed = subtitle?.trim();
  return (
    <div
      data-testid={rest["data-testid"] ?? "page-header"}
      className={cn(
        "relative overflow-hidden rounded-xl border p-5 shadow-md",
        gradientClassName ?? DEFAULT_GRADIENT,
        className,
      )}
    >
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
      <div className="relative flex items-center gap-3 flex-wrap">
        <div className="rounded-lg bg-white/15 backdrop-blur p-2.5 ring-1 ring-white/20">
          <Icon className="h-7 w-7 text-white" />
        </div>
        <div className="text-white min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight leading-tight">{title}</h1>
          {trimmed ? (
            <p className="text-xs text-white/80 mt-0.5">{trimmed}</p>
          ) : null}
        </div>
        {actions ? <div className="relative ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
