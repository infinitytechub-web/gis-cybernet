import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Volume2, VolumeX, UserPlus } from "lucide-react";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

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

// Roles allowed to receive the "new staff online" alert. Admin only — keeps
// the chime out of regular command-tier users' workflow.
const ALERT_ROLES = new Set(["admin"]);
const MUTE_KEY = "online-now.alert-muted";

/**
 * Plays a soft two-tone chime via Web Audio. ~250ms total, low volume.
 * No external assets required and respects the user's mute preference.
 */
function playJoinChime() {
  try {
    const Ctx: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tones = [
      { f: 660, t: 0 },
      { f: 880, t: 0.12 },
    ];
    tones.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.06, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    /* audio not available — silent */
  }
}

/**
 * Compact live-presence badge surfaced in the app header.
 * Visible only to the command tier; clicking it scrolls the dashboard
 * Online Now panel into view. Admins additionally hear a soft chime + see
 * a brief flash whenever the count of *other* online staff increases.
 */
export function OnlineNowBadge() {
  const { role, user } = useAuth();
  const { onlineCount, onlineUsers, windowMinutes } = useOnlineUsers();
  const [flash, setFlash] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(MUTE_KEY) === "1";
  });
  const prevOtherIdsRef = useRef<Set<string> | null>(null);
  const initializedRef = useRef(false);

  // Other staff = everyone online besides the current user.
  const otherIds = user
    ? onlineUsers.filter((u) => u.userId !== user.id).map((u) => u.userId)
    : onlineUsers.map((u) => u.userId);
  const otherStaffCount = otherIds.length;
  const hasOthers = otherStaffCount > 0;
  const isAdmin = role === "admin" || ALERT_ROLES.has(role ?? "");

  // Detect new staff joining (admin / deputy-admin alert).
  // Note: deputy admins are provisioned with the `admin` app_role, so the
  // single "admin" check covers both System Administrators and Deputy Admins.
  useEffect(() => {
    const currentSet = new Set(otherIds);
    const prev = prevOtherIdsRef.current;
    prevOtherIdsRef.current = currentSet;

    // Skip the first render so existing online users don't trigger a chime.
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (!isAdmin || !prev) return;

    const newcomers = onlineUsers.filter(
      (u) => u.userId !== user?.id && !prev.has(u.userId),
    );
    if (newcomers.length === 0) return;

    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1500);
    if (!muted) playJoinChime();

    // Toast so admins get an explicit notification, not just chime+flash.
    const first = newcomers[0];
    const name = `${first.rank ? first.rank + " " : ""}${first.firstName} ${first.lastName}`.trim();
    const extra = newcomers.length > 1 ? ` and ${newcomers.length - 1} other${newcomers.length > 2 ? "s" : ""}` : "";
    toast({
      title: "Staff online",
      description: `${name}${extra} just signed in${first.department ? ` — ${first.department}` : ""}.`,
    });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherIds.join("|"), isAdmin, muted]);

  if (!role || !ALLOWED_ROLES.has(role)) return null;

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMuted((m) => {
      const next = !m;
      try { window.localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="inline-flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/dashboard#online-now"
              aria-label={`${onlineCount} users online now${hasOthers ? `, including ${otherStaffCount} other staff` : ""}`}
              className="inline-flex items-center"
            >
              <Badge
                variant="outline"
                className={`gap-1.5 px-2 py-0.5 text-[11px] font-medium border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 transition-all ${
                  hasOthers ? "animate-pulse ring-2 ring-emerald-400/60 dark:ring-emerald-500/50 shadow-[0_0_8px_hsl(152_70%_45%/0.5)]" : ""
                } ${
                  flash ? "ring-4 ring-emerald-500 scale-110 shadow-[0_0_16px_hsl(152_70%_45%/0.9)]" : ""
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
              {isAdmin && (
                <p className="text-muted-foreground">
                  Admin alert: {muted ? "muted" : "chime + flash on new logins"}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Admin-only mute toggle — keeps chime opt-out one click away. */}
        {isAdmin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40"
                onClick={toggleMute}
                aria-label={muted ? "Unmute online-staff alert" : "Mute online-staff alert"}
                aria-pressed={muted}
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">{muted ? "Alerts muted" : "Mute alerts"}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
