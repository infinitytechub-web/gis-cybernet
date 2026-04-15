import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import { SystemAuditTray } from "@/components/SystemAuditTray";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useAuth } from "@/hooks/useAuth";
import { Clock, CalendarDays } from "lucide-react";
import { format } from "date-fns";

export function Layout({ children }: { children: React.ReactNode }) {
  const { org_name, system_label } = useAppSettings();
  const { isAdmin } = useAuth();
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="border-b bg-card px-4">
            <div className="h-14 flex items-center gap-4">
              <SidebarTrigger className="text-muted-foreground" />
              <h2 className="text-sm font-semibold flex-1 truncate" style={{ color: "hsl(152, 70%, 30%)" }}>Ghana Immigration Service: {system_label}</h2>
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums shrink-0">
                <CalendarDays className="h-3.5 w-3.5" />
                {format(clock, "EEE, dd MMM yyyy")}
                <span className="mx-0.5 opacity-40">·</span>
                <Clock className="h-3.5 w-3.5" />
                {clock.toLocaleTimeString()}
              </span>
              <ThemeToggle />
              {isAdmin && <SystemAuditTray />}
              <NotificationBell />
            </div>
            {/* Compact date & clock row for mobile */}
            <div className="sm:hidden flex items-center justify-center gap-2 pb-1.5 text-[11px] text-muted-foreground tabular-nums">
              <CalendarDays className="h-3 w-3" />
              {format(clock, "EEE, dd MMM yyyy")}
              <span className="opacity-40">·</span>
              <Clock className="h-3 w-3" />
              {clock.toLocaleTimeString()}
            </div>
          </header>
          <main className="flex-1 p-3 md:p-6 overflow-auto pb-20 lg:pb-6 scroll-smooth-gpu">
            <WelcomeBanner />
            {children}
          </main>
          <footer className="hidden lg:block border-t bg-card px-4 py-2 text-center text-xs text-muted-foreground">
            Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026
          </footer>
          <MobileBottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
}
