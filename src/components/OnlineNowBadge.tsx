import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Volume2, VolumeX, Settings2 } from "lucide-react";
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

// Roles allowed to receive the "new staff online" alert. Deputy admins are
// provisioned with the `admin` app_role, so this single entry covers both.
const ALERT_ROLES = new Set(["admin"]);

// Per-device preference keys (localStorage). Each channel can be toggled
// independently from the badge's settings popover.
const PREFS_KEY = "online-now.alert-prefs.v1";
// Legacy single-mute key — migrated into PREFS_KEY on first read.
const LEGACY_MUTE_KEY = "online-now.alert-muted";

interface AlertPrefs {
  chime: boolean;
  toast: boolean;
  flash: boolean;
}

const DEFAULT_PREFS: AlertPrefs = { chime: true, toast: true, flash: true };

function loadPrefs(): AlertPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AlertPrefs>;
      return { ...DEFAULT_PREFS, ...parsed };
    }
    // Migrate legacy mute flag → chime off.
    const legacy = window.localStorage.getItem(LEGACY_MUTE_KEY);
    if (legacy === "1") return { ...DEFAULT_PREFS, chime: false };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
}

function savePrefs(p: AlertPrefs) {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/**
 * Plays a soft two-tone chime via Web Audio. ~250ms total, low volume.
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
 * Compact live-presence badge surfaced in the app header. Visible to the
 * command tier; admins (incl. deputy admins) get configurable chime/toast/
 * flash alerts on new staff sign-ins, controlled per device.
 */
export function OnlineNowBadge() {
  const { role, user } = useAuth();
  const { onlineCount, onlineUsers, windowMinutes } = useOnlineUsers();
  const [flash, setFlash] = useState(false);
  const [prefs, setPrefs] = useState<AlertPrefs>(() => loadPrefs());
  const prevOtherIdsRef = useRef<Set<string> | null>(null);
  const initializedRef = useRef(false);

  const otherIds = user
    ? onlineUsers.filter((u) => u.userId !== user.id).map((u) => u.userId)
    : onlineUsers.map((u) => u.userId);
  const otherStaffCount = otherIds.length;
  const hasOthers = otherStaffCount > 0;
  const isAdmin = role === "admin" || ALERT_ROLES.has(role ?? "");

  const updatePref = (key: keyof AlertPrefs, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      return next;
    });
  };

  useEffect(() => {
    const currentSet = new Set(otherIds);
    const prev = prevOtherIdsRef.current;
    prevOtherIdsRef.current = currentSet;

    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (!isAdmin || !prev) return;

    const newcomers = onlineUsers.filter(
      (u) => u.userId !== user?.id && !prev.has(u.userId),
    );
    if (newcomers.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (prefs.flash) {
      setFlash(true);
      timer = setTimeout(() => setFlash(false), 1500);
    }
    if (prefs.chime) playJoinChime();
    if (prefs.toast) {
      const first = newcomers[0];
      const name = `${first.rank ? first.rank + " " : ""}${first.firstName} ${first.lastName}`.trim();
      const extra = newcomers.length > 1 ? ` and ${newcomers.length - 1} other${newcomers.length > 2 ? "s" : ""}` : "";
      toast({
        title: "Staff online",
        description: `${name}${extra} just signed in${first.department ? ` — ${first.department}` : ""}.`,
      });
    }
    return () => { if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherIds.join("|"), isAdmin, prefs.chime, prefs.toast, prefs.flash]);

  if (!role || !ALLOWED_ROLES.has(role)) return null;

  const allOff = !prefs.chime && !prefs.toast && !prefs.flash;
  const toggleChime = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updatePref("chime", !prefs.chime);
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
                  Alerts: {allOff ? "all off" : [
                    prefs.chime && "chime",
                    prefs.toast && "toast",
                    prefs.flash && "flash",
                  ].filter(Boolean).join(" + ")}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Admin-only quick mute toggle — flips the chime channel only. */}
        {isAdmin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40"
                onClick={toggleChime}
                aria-label={prefs.chime ? "Mute online-staff chime" : "Unmute online-staff chime"}
                aria-pressed={!prefs.chime}
              >
                {prefs.chime ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">{prefs.chime ? "Mute chime" : "Unmute chime"}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Admin-only settings popover — per-device control of each alert channel. */}
        {isAdmin && (
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40"
                    aria-label="Notification settings"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Notification settings</p>
              </TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-72">
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">Online-staff alerts</h4>
                  <p className="text-xs text-muted-foreground">
                    Saved on this device only.
                  </p>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="alert-chime" className="text-sm">Chime</Label>
                      <p className="text-[11px] text-muted-foreground">Soft two-tone audio cue.</p>
                    </div>
                    <Switch
                      id="alert-chime"
                      checked={prefs.chime}
                      onCheckedChange={(v) => updatePref("chime", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="alert-toast" className="text-sm">Toast</Label>
                      <p className="text-[11px] text-muted-foreground">Pop-up with name &amp; department.</p>
                    </div>
                    <Switch
                      id="alert-toast"
                      checked={prefs.toast}
                      onCheckedChange={(v) => updatePref("toast", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="alert-flash" className="text-sm">Flash</Label>
                      <p className="text-[11px] text-muted-foreground">Green pulse around the badge.</p>
                    </div>
                    <Switch
                      id="alert-flash"
                      checked={prefs.flash}
                      onCheckedChange={(v) => updatePref("flash", v)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setPrefs(DEFAULT_PREFS); savePrefs(DEFAULT_PREFS); }}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const off: AlertPrefs = { chime: false, toast: false, flash: false };
                      setPrefs(off); savePrefs(off);
                    }}
                  >
                    Mute all
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </TooltipProvider>
  );
}
