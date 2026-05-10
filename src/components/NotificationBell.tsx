import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Bell, Check, CheckCheck, Calendar, ArrowRightLeft, Clock, Info,
  AlertTriangle, Volume2, VolumeX, Stethoscope, Undo2
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const HEALTH_APPT_TYPES = new Set([
  "health_appointment_created",
  "health_appointment_status",
  "health_appointment_rescheduled",
  "health_appointment_cancelled",
]);

const typeIcons: Record<string, React.ReactNode> = {
  leave: <Calendar className="h-4 w-4 text-primary" />,
  posting: <ArrowRightLeft className="h-4 w-4 text-secondary" />,
  shift: <Clock className="h-4 w-4 text-amber-600" />,
  visa: <AlertTriangle className="h-4 w-4 text-orange-600" />,
  health: <Stethoscope className="h-4 w-4 text-emerald-600" />,
  general: <Info className="h-4 w-4 text-muted-foreground" />,
};

const typeLabels: Record<string, string> = {
  leave: "Leave",
  posting: "Posting",
  shift: "Shift",
  visa: "Visa",
  health: "Health",
  general: "General",
};

// Smart routing: 'general' notifications are routed by title keyword to the right module
function routeForNotification(n: any): string {
  const t = (n?.title || "").toLowerCase();
  if (HEALTH_APPT_TYPES.has(n?.type) || t.includes("appointment")) return "/health-lab";
  if (t.includes("detention") || t.includes("custody")) return "/holding";
  if (t.includes("inventory") || t.includes("stock")) return "/stores";
  if (t.includes("requisition") || t.includes("purchase order") || t.includes("invoice") || t.includes("rfq") || t.includes("contract")) return "/procurement";
  const map: Record<string, string> = {
    leave: "/leave",
    posting: "/postings",
    shift: "/shifts",
    visa: "/front-desk",
    general: "/",
  };
  return map[n?.type] || "/";
}

function isUrgent(n: any): boolean {
  return (
    n.title?.toLowerCase().includes("rejected") ||
    n.title?.toLowerCase().includes("urgent") ||
    (n.type === "leave" && !n.is_read) ||
    (n.type === "posting" && !n.is_read)
  );
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);

    // Second tone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1000;
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.45);
  } catch {
    // Audio not available
  }
}

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("notif-sound") !== "off";
  });
  const prevCountRef = useRef(0);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Realtime subscription with sound + toast
  const handleNewNotification = useCallback(
    (payload: any) => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      const n = payload.new;
      if (n && soundEnabled) playNotificationSound();
      if (n) {
        toast(n.title, {
          description: n.message,
          icon: n.type === "leave" ? "📋" : n.type === "posting" ? "🔄" : n.type === "shift" ? "⏰" : n.type === "visa" ? "🛂" : "ℹ️",
          action: {
            label: "View",
            onClick: () => navigate(routeForNotification(n)),
          },
          duration: 6000,
        });
      }
    },
    [user?.id, queryClient, soundEnabled, navigate]
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        handleNewNotification
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, handleNewNotification]);

  // Animate bell on new unread
  const unreadCount = notifications.filter((n: any) => !n.is_read).length;
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 800);
      return () => clearTimeout(t);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("notif-sound", next ? "on" : "off");
  };

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAsUnreadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user!.id).eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const handleClick = (n: any) => {
    if (!n.is_read) markAsReadMutation.mutate(n.id);
    navigate(routeForNotification(n));
    setOpen(false);
  };

  const normType = (n: any) => HEALTH_APPT_TYPES.has(n?.type) ? "health" : n?.type;
  const filtered = tab === "all"
    ? notifications
    : tab === "unread"
      ? notifications.filter((n: any) => !n.is_read)
      : notifications.filter((n: any) => normType(n) === tab);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-scale-in">
              {unreadCount > 9 ? "9+" : unreadCount}
              <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-40" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px] px-1.5 py-0">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleSound} title={soundEnabled ? "Mute sounds" : "Enable sounds"}>
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
            </Button>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => markAllReadMutation.mutate()} disabled={markAllReadMutation.isPending}>
                <CheckCheck className="h-3 w-3" /> All read
              </Button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="border-b px-2">
            <TabsList className="h-8 w-full bg-transparent gap-0 p-0">
              {["all", "unread", "leave", "posting", "shift", "visa", "health"].map((t) => (
                <TabsTrigger key={t} value={t} className="text-[11px] h-8 px-2 py-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent capitalize">
                  {t === "all" ? "All" : t === "unread" ? `Unread (${unreadCount})` : typeLabels[t] || t}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value={tab} className="m-0">
            <ScrollArea className="max-h-[400px]">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No notifications
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((n: any) => {
                    const urgent = isUrgent(n);
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`group flex gap-3 px-4 py-3 text-sm transition-colors w-full text-left hover:bg-accent/50 ${
                          n.is_read ? "opacity-60" : ""
                        } ${urgent && !n.is_read ? "bg-destructive/5 border-l-2 border-l-destructive" : !n.is_read ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {urgent && !n.is_read ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          ) : (
                            typeIcons[normType(n)] ?? typeIcons.general
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-foreground leading-tight truncate">{n.title}</p>
                            {!n.is_read && (
                              <span className="shrink-0 h-2 w-2 rounded-full bg-primary" />
                            )}
                          </div>
                          <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{n.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 capitalize">
                              {typeLabels[n.type] || n.type}
                            </Badge>
                            <span className="text-muted-foreground text-[10px]">
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                        {!n.is_read ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            title="Mark as read"
                            onClick={(e) => { e.stopPropagation(); markAsReadMutation.mutate(n.id); }}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Mark as unread"
                            onClick={(e) => { e.stopPropagation(); markAsUnreadMutation.mutate(n.id); }}
                          >
                            <Undo2 className="h-3 w-3" />
                          </Button>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
