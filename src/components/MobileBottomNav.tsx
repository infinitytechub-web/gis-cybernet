import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard, Users, Contact, CalendarOff, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  CalendarCheck, Building2, Award, Clock, Calendar,
  ArrowRightLeft, ClipboardCheck, BarChart3, CalendarDays, Shield, Megaphone, Stamp, Activity, FileSearch,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const primaryTabs = [
  { title: "Home", url: "/", icon: LayoutDashboard, iconColor: "text-blue-600 dark:text-blue-400" },
  { title: "Staff", url: "/staff", icon: Users, iconColor: "text-emerald-600 dark:text-emerald-400" },
  { title: "Directory", url: "/directory", icon: Contact, iconColor: "text-teal-600 dark:text-teal-400" },
  { title: "Leave", url: "/leave", icon: CalendarOff, iconColor: "text-orange-600 dark:text-orange-400" },
];

const moreItems = [
  { title: "Departments", url: "/departments", icon: Building2, iconColor: "text-purple-600 dark:text-purple-400" },
  { title: "Roles", url: "/roles", icon: Award, iconColor: "text-amber-600 dark:text-amber-400" },
  { title: "Shifts", url: "/shifts", icon: Clock, iconColor: "text-indigo-600 dark:text-indigo-400" },
  { title: "Duty Roster", url: "/roster", icon: CalendarDays, iconColor: "text-cyan-600 dark:text-cyan-400" },
  { title: "Attendance", url: "/attendance", icon: CalendarCheck, iconColor: "text-green-600 dark:text-green-400" },
  { title: "Holidays", url: "/holidays", icon: Calendar, iconColor: "text-rose-600 dark:text-rose-400" },
  { title: "Postings & Reassignment", url: "/postings", icon: ArrowRightLeft, iconColor: "text-violet-600 dark:text-violet-400" },
  { title: "Compliance", url: "/compliance", icon: ClipboardCheck, iconColor: "text-sky-600 dark:text-sky-400" },
  { title: "Reports", url: "/reports", icon: BarChart3, iconColor: "text-fuchsia-600 dark:text-fuchsia-400" },
  { title: "Processing", url: "/processing", icon: FileSearch, iconColor: "text-amber-600 dark:text-amber-400" },
  { title: "Front Desk", url: "/front-desk", icon: Stamp, iconColor: "text-lime-600 dark:text-lime-400" },
  { title: "Analytics", url: "/analytics", icon: Activity, iconColor: "text-pink-600 dark:text-pink-400" },
];

const adminItems = [
  { title: "Announcements", url: "/announcements", icon: Megaphone, iconColor: "text-red-600 dark:text-red-400" },
  { title: "Settings", url: "/settings", icon: Shield, iconColor: "text-slate-600 dark:text-slate-400" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isAdminOrSupervisor } = useAuth();
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  const isActive = (url: string) =>
    url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);

  const moreActive = moreItems.some((item) => isActive(item.url)) || (isAdminOrSupervisor && adminItems.some((item) => isActive(item.url)));

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
      <div className="grid grid-cols-5 h-14">
        {primaryTabs.map((tab) => (
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
            <tab.icon className={`h-5 w-5 ${tab.iconColor}`} />
            {tab.title}
          </button>
        ))}

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
          <DropdownMenuContent align="end" side="top" className="w-48 mb-2 max-h-[60vh] overflow-y-auto">
            {moreItems.map((item) => (
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
            {isAdminOrSupervisor && (
              <>
                <DropdownMenuSeparator />
                {adminItems.map((item) => (
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
