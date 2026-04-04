import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4">
            <SidebarTrigger className="text-muted-foreground" />
            <h2 className="text-sm font-semibold text-secondary flex-1">Ghana Immigration Service — Amasaman Sector Command</h2>
            <NotificationBell />
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
          <footer className="border-t bg-card px-4 py-2 text-center text-xs text-muted-foreground">
            Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
