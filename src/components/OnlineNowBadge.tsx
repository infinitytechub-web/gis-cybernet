import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";
import { useAuth } from "@/hooks/useAuth";

const ALLOWED_ROLES = new Set([
  "admin",
  "oic",
  "2ic",
  "head_of_administration",
  "chief_staff_officer",
  "staff_officer",
  "supervisor",
]);

/**
 * Compact live-presence badge surfaced in the app header.
 * Visible only to the command tier; clicking it scrolls the dashboard
 * Online Now panel into view.
 */
export function OnlineNowBadge() {
  const { role } = useAuth();
  const { onlineCount, windowMinutes } = useOnlineUsers();

  if (!role || !ALLOWED_ROLES.has(role)) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/dashboard#online-now"
            aria-label={`${onlineCount} users online now`}
            className="inline-flex items-center"
          >
            <Badge
              variant="outline"
              className="gap-1.5 px-2 py-0.5 text-[11px] font-medium border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 transition-colors"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="tabular-nums">{onlineCount}</span>
              <span className="hidden md:inline">online</span>
            </Badge>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            {onlineCount} user{onlineCount !== 1 ? "s" : ""} active in the last {windowMinutes} min
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
