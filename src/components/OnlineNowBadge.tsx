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
  "deputy_supervisor",
  "ipse_supervisor",
  "ipse_deputy_supervisor",
  "shift_supervisor",
  "deputy_shift_supervisor",
  "shift_leader",
  "deputy_shift_leader",
]);

/**
 * Compact live-presence badge surfaced in the app header.
 * Visible only to the command tier; clicking it scrolls the dashboard
 * Online Now panel into view.
 */
export function OnlineNowBadge() {
  const { role, user } = useAuth();
  const { onlineCount, onlineUsers, windowMinutes } = useOnlineUsers();

  if (!role || !ALLOWED_ROLES.has(role)) return null;

  // Other staff = everyone online besides the current user.
  const otherStaffCount = user
    ? onlineUsers.filter((u) => u.userId !== user.id).length
    : onlineCount;
  const hasOthers = otherStaffCount > 0;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/dashboard#online-now"
            aria-label={`${onlineCount} users online now${hasOthers ? `, including ${otherStaffCount} other staff` : ""}`}
            className="inline-flex items-center"
          >
            <Badge
              variant="outline"
              className={`gap-1.5 px-2 py-0.5 text-[11px] font-medium border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 transition-colors ${
                hasOthers ? "animate-pulse ring-2 ring-emerald-400/60 dark:ring-emerald-500/50 shadow-[0_0_8px_hsl(152_70%_45%/0.5)]" : ""
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="tabular-nums">{onlineCount}</span>
              <span className="hidden md:inline">online</span>
              {hasOthers && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full bg-emerald-500 text-[10px] font-semibold text-white tabular-nums animate-pulse">
                  +{otherStaffCount}
                </span>
              )}
            </Badge>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs space-y-0.5">
            <p>
              {onlineCount} user{onlineCount !== 1 ? "s" : ""} active in the last {windowMinutes} min
            </p>
            {hasOthers && (
              <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                {otherStaffCount} other staff online — click to view
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
