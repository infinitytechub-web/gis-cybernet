import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, MapPin, Clock, RefreshCw, Search, Filter, X } from "lucide-react";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNowStrict, format } from "date-fns";

const SHOW_DETAILS_KEY = "online-now.show-details";

const ALLOWED_ROLES = [
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
];

export default function OnlineNowPanel() {
  const { role } = useAuth();
  const { onlineUsers, recentlyOfflineUsers, onlineCount, windowMinutes, lastSyncAt, refreshIntervalMs } = useOnlineUsers();
  const isAdmin = role === "admin";
  const [tick, setTick] = useState(Date.now());
  const [spinning, setSpinning] = useState(false);
  const [showDetails, setShowDetails] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(SHOW_DETAILS_KEY);
    return stored === null ? true : stored === "1";
  });
  // Admin-only filters: narrow the visible heads before scanning/exporting.
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [lastActiveWithin, setLastActiveWithin] = useState<string>("any"); // minutes or "any"
  const [staffSearch, setStaffSearch] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHOW_DETAILS_KEY, showDetails ? "1" : "0");
    }
  }, [showDetails]);

  // 1s ticker drives the visible countdown.
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Briefly spin the refresh icon when a new presence sync arrives.
  useEffect(() => {
    setSpinning(true);
    const t = setTimeout(() => setSpinning(false), 700);
    return () => clearTimeout(t);
  }, [lastSyncAt, onlineCount]);

  const elapsed = tick - lastSyncAt;
  const secondsToNext = Math.max(0, Math.ceil((refreshIntervalMs - elapsed) / 1000));
  const secondsSinceSync = Math.max(0, Math.floor(elapsed / 1000));

  if (!role || !ALLOWED_ROLES.includes(role)) return null;

  return (
    <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          Online Now — Live Presence
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-[10px] py-0 px-1.5"
            title="Streaming live via Realtime — no refresh needed"
          >
            <span aria-hidden="true" className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            Live
          </Badge>
          <span className="text-[10px] font-normal text-muted-foreground">
            (active in last {windowMinutes} min)
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground tabular-nums"
                    aria-live="polite"
                  >
                    <RefreshCw className={`h-3 w-3 ${spinning ? "animate-spin text-emerald-600" : ""}`} />
                    {secondsToNext}s
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="text-xs">
                    <div>Next refresh in {secondsToNext}s</div>
                    <div className="text-muted-foreground">Last sync {secondsSinceSync}s ago</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex items-center gap-1.5 pl-1.5 ml-1 border-l border-emerald-200 dark:border-emerald-800">
              <Switch
                id="online-show-details"
                checked={showDetails}
                onCheckedChange={setShowDetails}
                className="scale-75 data-[state=checked]:bg-emerald-600"
                aria-label="Toggle staff names and department"
              />
              <Label
                htmlFor="online-show-details"
                className="text-[10px] font-normal text-muted-foreground cursor-pointer select-none"
              >
                {showDetails ? "Names" : "Compact"}
              </Label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setTick(Date.now())}
              aria-label="Refresh now"
            >
              Refresh
            </Button>
            <Badge variant="outline" className="text-[10px]">
              {onlineCount} user{onlineCount !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-emerald-200/60 dark:border-emerald-800/60">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Filters:</span>
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-7 w-[120px] text-[11px]" aria-label="Status filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="online">Online only</SelectItem>
                <SelectItem value="offline">Offline only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={lastActiveWithin} onValueChange={setLastActiveWithin}>
              <SelectTrigger className="h-7 w-[150px] text-[11px]" aria-label="Last active time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any time</SelectItem>
                <SelectItem value="1">Last 1 min</SelectItem>
                <SelectItem value="5">Last 5 min</SelectItem>
                <SelectItem value="15">Last 15 min</SelectItem>
                <SelectItem value="30">Last 30 min</SelectItem>
                <SelectItem value="60">Last 60 min</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                placeholder="Search name, Staff ID, rank, department…"
                className="h-7 pl-7 pr-7 text-[11px]"
                aria-label="Search staff"
              />
              {staffSearch && (
                <button
                  type="button"
                  onClick={() => setStaffSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {(statusFilter !== "all" || lastActiveWithin !== "any" || staffSearch) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={() => { setStatusFilter("all"); setLastActiveWithin("any"); setStaffSearch(""); }}
              >
                Reset
              </Button>
            )}
          </div>
        )}
        {(() => {
          // Admins see the full roster (online + recently offline w/ grey dot).
          // Non-admins see only currently-online users.
          const baseList = isAdmin
            ? [
                ...onlineUsers.map((u) => ({ ...u, isOnline: true as const })),
                ...recentlyOfflineUsers.map((u) => ({ ...u, isOnline: false as const })),
              ]
            : onlineUsers.map((u) => ({ ...u, isOnline: true as const }));

          const q = staffSearch.trim().toLowerCase();
          const cutoffMs = lastActiveWithin === "any" ? 0 : Number(lastActiveWithin) * 60_000;
          const now = Date.now();
          const list = baseList.filter((u) => {
            if (isAdmin) {
              if (statusFilter === "online" && !u.isOnline) return false;
              if (statusFilter === "offline" && u.isOnline) return false;
              if (cutoffMs > 0) {
                const t = new Date(u.lastActiveAt ?? u.onlineSince).getTime();
                if (!Number.isFinite(t) || now - t > cutoffMs) return false;
              }
              if (q) {
                const hay = `${u.firstName ?? ""} ${u.lastName ?? ""} ${u.staffId ?? ""} ${u.rank ?? ""} ${u.department ?? ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
              }
            }
            return true;
          });

          if (list.length === 0) {
            return (
              <p className="text-sm text-muted-foreground">
                {isAdmin && (statusFilter !== "all" || lastActiveWithin !== "any" || staffSearch)
                  ? "No users match the current filters."
                  : "No users currently online"}
              </p>
            );
          }
          return (
            <ScrollArea className="max-h-[260px]">
              <div className={
                showDetails
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
                  : "flex flex-wrap gap-1.5"
              }>
                {list.map((u) => {
                  const isNightGuard = u.department?.toLowerCase().includes("night guard");
                  let onlineFor = "";
                  try {
                    onlineFor = formatDistanceToNowStrict(new Date(u.onlineSince), { addSuffix: false });
                  } catch { /* ignore */ }
                  let lastActiveRelative = "";
                  let lastActiveExact = "";
                  try {
                    const lastDate = new Date(u.lastActiveAt ?? u.onlineSince);
                    lastActiveRelative = formatDistanceToNowStrict(lastDate, { addSuffix: true });
                    lastActiveExact = format(lastDate, "PPpp");
                  } catch { /* ignore */ }
                  const statusLabel = u.isOnline ? "Online" : "Offline";
                  const a11yLabel =
                    `${u.firstName} ${u.lastName}, ${u.staffId}` +
                    `${u.rank ? `, ${u.rank}` : ""}` +
                    `${u.department ? `, ${u.department}` : ""}` +
                    `. ${statusLabel}. Last active ${lastActiveRelative || "unknown"}.`;
                  return (
                    <TooltipProvider key={u.userId} delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={a11yLabel}
                            className={`${
                              showDetails ? "flex items-center gap-2 px-2 py-2" : "inline-flex items-center justify-center p-1"
                            } rounded-md border transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                              !u.isOnline
                                ? "bg-muted/40 border-border opacity-70"
                                : isNightGuard
                                  ? "bg-amber-100/60 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700"
                                  : "bg-background border-border"
                            }`}
                          >
                            <div className="relative shrink-0">
                              <Avatar className={`${showDetails ? "h-9 w-9" : "h-8 w-8"} ${!u.isOnline ? "grayscale" : ""}`}>
                                {u.photoUrl ? <AvatarImage src={u.photoUrl} alt="" /> : null}
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {u.firstName?.[0]}
                                  {u.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              {u.isOnline ? (
                                <span
                                  className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5"
                                  role="status"
                                  aria-label={`${u.firstName} ${u.lastName} is online`}
                                  title="Online"
                                >
                                  <span aria-hidden="true" className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                                  <span aria-hidden="true" className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success ring-2 ring-background" />
                                </span>
                              ) : (
                                <span
                                  className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5"
                                  role="status"
                                  aria-label={`${u.firstName} ${u.lastName} is offline`}
                                  title="Offline"
                                >
                                  <span aria-hidden="true" className="relative inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/70 ring-2 ring-background" />
                                </span>
                              )}
                            </div>
                            {showDetails && (
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="text-xs font-semibold truncate">
                                    {u.firstName} {u.lastName}
                                  </span>
                                  {isNightGuard && (
                                    <Shield className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                                  )}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                                  <span className="truncate font-medium">{u.staffId}</span>
                                  {u.rank && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="truncate">{u.rank}</span>
                                    </>
                                  )}
                                </div>
                                {u.department && (
                                  <div className="text-[10px] text-muted-foreground truncate font-medium">
                                    {u.department}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-[10px] mt-0.5 flex-wrap">
                                  {u.isOnline && u.currentPage && (
                                    <span className="inline-flex items-center gap-0.5 text-primary">
                                      <MapPin className="h-2.5 w-2.5" aria-hidden="true" />
                                      {u.currentPage}
                                    </span>
                                  )}
                                  {u.isOnline && onlineFor && (
                                    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                      <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                                      {onlineFor}
                                    </span>
                                  )}
                                </div>
                                {isAdmin && lastActiveRelative && (
                                  <div
                                    className="text-[10px] text-muted-foreground mt-0.5"
                                    title={lastActiveExact}
                                  >
                                    Last active {lastActiveRelative}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1 text-xs">
                            <div className="font-semibold">{u.firstName} {u.lastName}</div>
                            <div className="text-muted-foreground">
                              <span className="font-medium">Status:</span> {statusLabel}
                            </div>
                            <div className="text-muted-foreground">
                              <span className="font-medium">Online ID:</span> {u.staffId}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground" title={u.userId}>
                              UID: {u.userId.slice(0, 8)}…{u.userId.slice(-4)}
                            </div>
                            {u.department && (
                              <div className="text-muted-foreground">
                                <span className="font-medium">Department:</span> {u.department}
                              </div>
                            )}
                            {u.rank && (
                              <div className="text-muted-foreground">
                                <span className="font-medium">Rank:</span> {u.rank}
                              </div>
                            )}
                            {lastActiveRelative && (
                              <div className="text-muted-foreground">
                                <span className="font-medium">Last active:</span> {lastActiveRelative}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </ScrollArea>
          );
        })()}
      </CardContent>
    </Card>
  );
}
