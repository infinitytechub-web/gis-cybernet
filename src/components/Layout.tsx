import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileBottomNav } from "@/components/MobileBottomNav";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4">
            <SidebarTrigger className="text-muted-foreground" />
            <h2 className="text-sm font-semibold text-secondary flex-1">Ghana Immigration Service — Amasaman Sector Command — Cybernet</h2>
            <ThemeToggle />
            <NotificationBell />
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 lg:pb-6">
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
