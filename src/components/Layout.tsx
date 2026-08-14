import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { HeaderProfileDropdown } from "@/components/HeaderProfileDropdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { WelcomeBanner } from "@/components/WelcomeBanner";

import { OnlineNowBadge } from "@/components/OnlineNowBadge";
import { SystemAuditTray } from "@/components/SystemAuditTray";
import { HeaderRoleSwitcher } from "@/components/HeaderRoleSwitcher";
import { HeaderCommandSwitcher } from "@/components/HeaderCommandSwitcher";
import { HeaderOverflowMenu } from "@/components/HeaderOverflowMenu";
import { useBranding } from "@/hooks/useBranding";
import { useAuth } from "@/hooks/useAuth";
import { Clock, CalendarDays } from "lucide-react";
import { format } from "date-fns";

export function Layout({ children }: { children: React.ReactNode }) {
  const branding = useBranding();
  const { company_name, footer_text } = branding;
  const { isAdmin } = useAuth();
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="border-b bg-card px-4">
            <div className="h-14 flex items-center gap-4">
              <SidebarTrigger className="text-muted-foreground" />
              <h2 className="text-sm font-semibold flex-1 truncate" style={{ color: "hsl(var(--brand-accent))" }}>{company_name}: {branding.system_label}</h2>
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums shrink-0">
                <CalendarDays className="h-3.5 w-3.5" />
                {format(clock, "EEE, dd/MM/yyyy")}
                <span className="mx-0.5 opacity-40">·</span>
                <Clock className="h-3.5 w-3.5" />
                {clock.toLocaleTimeString()}
              </span>
              <ThemeToggle />
              {/* Primary tiles always visible */}
              {isAdmin && <SystemAuditTray />}
              {/* Live presence chip — visible to admin & full command tier */}
              <OnlineNowBadge />
              <NotificationBell />
              <HeaderProfileDropdown />
              {/* Overflow tile — collapses 3+ secondary icons into a dropdown grid
                  whenever the bar would otherwise show more than five tiles. */}
              <HeaderOverflowMenu label="More tools">
                <HeaderRoleSwitcher />
                <HeaderCommandSwitcher />
              </HeaderOverflowMenu>
            </div>
            {/* Compact date & clock row for mobile */}
            <div className="sm:hidden flex items-center justify-center gap-2 pb-1.5 text-[11px] text-muted-foreground tabular-nums">
              <CalendarDays className="h-3 w-3" />
              {format(clock, "EEE, dd/MM/yyyy")}
              <span className="opacity-40">·</span>
              <Clock className="h-3 w-3" />
              {clock.toLocaleTimeString()}
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 max-w-full p-3 md:p-6 overflow-x-hidden overflow-y-auto pb-20 lg:pb-6 scroll-smooth-gpu">
            <WelcomeBanner />
            {children}
          </main>
          <footer className="hidden lg:block border-t bg-card px-4 py-2 text-center text-xs text-muted-foreground">
            {footer_text}
          </footer>
          <MobileBottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
}
