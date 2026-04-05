import { useLocation, useNavigate } from "react-router-dom";
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
  ArrowRightLeft, ClipboardCheck, BarChart3, CalendarDays, Shield, Megaphone,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const primaryTabs = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Staff", url: "/staff", icon: Users },
  { title: "Directory", url: "/directory", icon: Contact },
  { title: "Leave", url: "/leave", icon: CalendarOff },
];

const moreItems = [
  { title: "Departments", url: "/departments", icon: Building2 },
  { title: "Roles", url: "/roles", icon: Award },
  { title: "Shifts", url: "/shifts", icon: Clock },
  { title: "Duty Roster", url: "/roster", icon: CalendarDays },
  { title: "Attendance", url: "/attendance", icon: CalendarCheck },
  { title: "Holidays", url: "/holidays", icon: Calendar },
  { title: "Postings", url: "/postings", icon: ArrowRightLeft },
  { title: "Compliance", url: "/compliance", icon: ClipboardCheck },
  { title: "Reports", url: "/reports", icon: BarChart3 },
];

const adminItems = [
  { title: "Settings", url: "/settings", icon: Shield },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const isActive = (url: string) =>
    url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);

  const moreActive = moreItems.some((item) => isActive(item.url)) || (isAdmin && adminItems.some((item) => isActive(item.url)));

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 safe-bottom">
      <div className="grid grid-cols-5 h-14">
        {primaryTabs.map((tab) => (
          <button
            key={tab.url}
            onClick={() => navigate(tab.url)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
              isActive(tab.url)
                ? "text-primary font-semibold"
                : "text-muted-foreground"
            )}
          >
            <tab.icon className="h-5 w-5" />
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
          <DropdownMenuContent align="end" side="top" className="w-48 mb-2">
            {moreItems.map((item) => (
              <DropdownMenuItem
                key={item.url}
                onClick={() => navigate(item.url)}
                className={cn(
                  "gap-2",
                  isActive(item.url) && "text-primary font-medium"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </DropdownMenuItem>
            ))}
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                {adminItems.map((item) => (
                  <DropdownMenuItem
                    key={item.url}
                    onClick={() => navigate(item.url)}
                    className={cn(
                      "gap-2",
                      isActive(item.url) && "text-primary font-medium"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
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
