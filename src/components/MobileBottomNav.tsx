import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Contact, CalendarOff, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRbac } from "@/hooks/useRbac";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  CalendarCheck, Building2, Award, Clock, Calendar,
  ArrowRightLeft, ClipboardCheck, BarChart3, CalendarDays, Shield, Megaphone, Stamp, Activity, FileSearch, ShieldAlert, Crosshair, Package, Lock, Briefcase,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getSignedPhotoUrl } from "@/lib/photo-utils";

const primaryTabs = [
  { title: "Home", url: "/", icon: LayoutDashboard, iconColor: "text-blue-600 dark:text-blue-400" },
  { title: "Staff", url: "/staff", icon: Users, iconColor: "text-emerald-600 dark:text-emerald-400" },
  { title: "Attendance", url: "/attendance", icon: CalendarCheck, iconColor: "text-green-600 dark:text-green-400" },
  { title: "Leave", url: "/leave", icon: CalendarOff, iconColor: "text-orange-600 dark:text-orange-400" },
];

const moreItems = [
  // Command & Control
  { title: "Analytics", url: "/analytics", icon: Activity, iconColor: "text-pink-600 dark:text-pink-400", group: "Command" },
  { title: "Reports", url: "/reports", icon: BarChart3, iconColor: "text-fuchsia-600 dark:text-fuchsia-400", group: "Command" },
  // Personnel
  { title: "Directory", url: "/directory", icon: Contact, iconColor: "text-teal-600 dark:text-teal-400", group: "Personnel" },
  { title: "Departments", url: "/departments", icon: Building2, iconColor: "text-purple-600 dark:text-purple-400", group: "Personnel" },
  { title: "Roles", url: "/roles", icon: Award, iconColor: "text-amber-600 dark:text-amber-400", group: "Personnel" },
  // Workforce
  { title: "Shifts", url: "/shifts", icon: Clock, iconColor: "text-indigo-600 dark:text-indigo-400", group: "Workforce" },
  { title: "Duty Roster", url: "/roster", icon: CalendarDays, iconColor: "text-cyan-600 dark:text-cyan-400", group: "Workforce" },
  { title: "Holidays", url: "/holidays", icon: Calendar, iconColor: "text-rose-600 dark:text-rose-400", group: "Workforce" },
  { title: "Postings & Transfers", url: "/postings", icon: ArrowRightLeft, iconColor: "text-violet-600 dark:text-violet-400", group: "Workforce" },
  // Immigration Services
  { title: "Front Desk", url: "/front-desk", icon: Stamp, iconColor: "text-lime-600 dark:text-lime-400", group: "Immigration" },
  { title: "Processing", url: "/processing", icon: FileSearch, iconColor: "text-amber-600 dark:text-amber-400", group: "Immigration" },
  // Security & Enforcement
  { title: "Operations", url: "/operations", icon: Crosshair, iconColor: "text-orange-600 dark:text-orange-400", group: "Security" },
  { title: "Holding Center", url: "/holding", icon: Lock, iconColor: "text-red-700 dark:text-red-500", group: "Security" },
  { title: "Enforcement", url: "/enforcement", icon: ShieldAlert, iconColor: "text-red-600 dark:text-red-400", group: "Security" },
  { title: "Compliance", url: "/compliance", icon: ClipboardCheck, iconColor: "text-sky-600 dark:text-sky-400", group: "Security" },
  { title: "MISD / CYBER", url: "/misd", icon: Shield, iconColor: "text-purple-700 dark:text-purple-300", group: "Security" },
  { title: "IPSE", url: "/ipse", icon: Shield, iconColor: "text-[hsl(82,40%,30%)] dark:text-[hsl(82,50%,65%)]", group: "Security" },
  // Logistics
  { title: "Stores & Inventory", url: "/stores", icon: Package, iconColor: "text-amber-700 dark:text-amber-500", group: "Logistics" },
  // Finance & Procurement
  { title: "Procurement Unit", url: "/procurement", icon: Briefcase, iconColor: "text-emerald-700 dark:text-emerald-400", group: "Finance" },
];

const adminItems = [
  { title: "Announcements", url: "/announcements", icon: Megaphone, iconColor: "text-red-600 dark:text-red-400" },
  { title: "Settings", url: "/settings", icon: Shield, iconColor: "text-slate-600 dark:text-slate-400" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isAdminOrSupervisor } = useAuth();
  const { canPath } = useRbac();
  // RBAC: only surface destinations this account may open.
  const visibleTabs = primaryTabs.filter((t) => canPath(t.url));
  const visibleMore = moreItems.filter((i) => canPath(i.url));
  const visibleAdmin = adminItems.filter((i) => canPath(i.url));
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [initials, setInitials] = useState<string>("U");

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id, photo_url, first_name, last_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfileId(data.id);
          setInitials(`${data.first_name[0]}${data.last_name[0]}`.toUpperCase());
          if (data.photo_url) {
            getSignedPhotoUrl(data.photo_url).then(setProfilePhoto);
          }
        }
      });
  }, [user]);

  const isActive = (url: string) =>
    url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);

  const moreActive = visibleMore.some((item) => isActive(item.url)) || visibleAdmin.some((item) => isActive(item.url));

  const handleNavigate = useCallback((url: string) => {
    navigate(url);
    setHidden(true);
  }, [navigate]);

  // Show nav bar again on scroll up or after settling
  useEffect(() => {
    if (!hidden) return;

    const timer = setTimeout(() => setHidden(false), 2000);

    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < lastScrollY.current - 10) {
        setHidden(false);
      }
      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [hidden]);

  // Reset on route change (in case navigation didn't trigger scroll)
  useEffect(() => {
    lastScrollY.current = window.scrollY;
  }, [location.pathname]);

  return (
    <nav
      className={cn(
        "lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 safe-bottom transition-transform duration-300",
        hidden && "translate-y-full"
      )}
    >
      <div className="grid grid-cols-6 h-14">
        {visibleTabs.map((tab) => (
          <button
            key={tab.url}
            onClick={() => handleNavigate(tab.url)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
              isActive(tab.url)
                ? "text-primary font-semibold"
                : "text-muted-foreground"
            )}
          >
            <div className="relative">
              <tab.icon className={`h-5 w-5 ${tab.iconColor}`} />
              {tab.url === "/" && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                  <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-40" />
                </span>
              )}
            </div>
            {tab.title}
          </button>
        ))}

        {/* My Profile tab */}
        <button
          onClick={() => profileId && handleNavigate(`/staff/${profileId}`)}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
            location.pathname.startsWith("/staff/") && profileId && location.pathname === `/staff/${profileId}`
              ? "text-primary font-semibold"
              : "text-muted-foreground"
          )}
        >
          <div className="relative">
            <Avatar className="h-5 w-5">
              {profilePhoto && <AvatarImage src={profilePhoto} alt="Profile" />}
              <AvatarFallback className="text-[8px] bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            {/* Online status indicator */}
            <span className="absolute bottom-0 right-0 block h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-card" />
          </div>
          Profile
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
                moreActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              More
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52 mb-2 max-h-[60vh] overflow-y-auto">
            {(() => {
              let lastGroup = "";
              return visibleMore.map((item, idx) => {
                const isFirstInGroup = item.group !== lastGroup;
                if (isFirstInGroup) lastGroup = item.group;
                return (
                  <div key={item.url}>
                    {isFirstInGroup && idx > 0 && <DropdownMenuSeparator />}
                    {isFirstInGroup && (
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {item.group}
                      </div>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleNavigate(item.url)}
                      className={cn(
                        "gap-2",
                        isActive(item.url) && "text-primary font-medium"
                      )}
                    >
                      <item.icon className={`h-4 w-4 ${item.iconColor}`} />
                      {item.title}
                    </DropdownMenuItem>
                  </div>
                );
              });
            })()}
            {visibleAdmin.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {visibleAdmin.map((item) => (
                  <DropdownMenuItem
                    key={item.url}
                    onClick={() => handleNavigate(item.url)}
                    className={cn(
                      "gap-2",
                      isActive(item.url) && "text-primary font-medium"
                    )}
                  >
                    <item.icon className={`h-4 w-4 ${item.iconColor}`} />
                    {item.title}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
