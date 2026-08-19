import { type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DashboardSectionProps {
  id: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Marks a section that carries restricted information. */
  restricted?: boolean;
  /** Accent colour class for the rule and heading. */
  accent?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * One band of the dashboard. Every section is a landmark with its own heading,
 * so the information hierarchy is identical for every role and readable by
 * assistive technology.
 */
export function DashboardSection({
  id,
  title,
  description,
  icon: Icon,
  restricted = false,
  accent = "text-primary",
  className,
  children,
}: DashboardSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("space-y-3 scroll-mt-20", className)}>
      <div className={cn("flex items-center gap-2 border-l-4 pl-3 py-1", restricted ? "border-l-destructive" : "border-l-primary")}>
        {Icon && <Icon className={cn("h-4 w-4", restricted ? "text-destructive" : accent)} aria-hidden="true" />}
        <h2
          id={headingId}
          className={cn("text-sm font-bold uppercase tracking-wider", restricted ? "text-destructive" : accent)}
        >
          {title}
        </h2>
        {restricted && (
          <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
            Restricted
          </Badge>
        )}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default DashboardSection;
