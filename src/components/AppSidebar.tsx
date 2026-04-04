import {
  LayoutDashboard, Users, Building2, Award, Clock, CalendarCheck,
  CalendarOff, Calendar, ArrowRightLeft, LogOut, Shield, ClipboardCheck, BarChart3, KeyRound, Contact, CalendarDays
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import gisLogo from "@/assets/gis-logo.jpeg";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Staff / Employees", url: "/staff", icon: Users },
  { title: "Staff Directory", url: "/directory", icon: Contact },
  { title: "Departments", url: "/departments", icon: Building2 },
  { title: "Roles / Designations", url: "/roles", icon: Award },
  { title: "Office Shifts", url: "/shifts", icon: Clock },
  { title: "Duty Roster", url: "/roster", icon: CalendarDays },
  { title: "Attendance", url: "/attendance", icon: CalendarCheck },
  { title: "Leave / Pass Requests", url: "/leave", icon: CalendarOff },
  { title: "Holidays", url: "/holidays", icon: Calendar },
  { title: "Postings & Transfers", url: "/postings", icon: ArrowRightLeft },
  { title: "Compliance", url: "/compliance", icon: ClipboardCheck },
  { title: "Reports", url: "/reports", icon: BarChart3 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, role } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={gisLogo} alt="GIS" className="h-10 w-10 rounded-full object-cover border border-sidebar-border" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-primary-foreground">GIS - ASC</span>
              <span className="text-xs text-sidebar-foreground/70">HRM System</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/"} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="flex items-center gap-2 mb-2 text-xs text-sidebar-foreground/60">
            <Shield className="h-3 w-3" />
            <span className="capitalize">{role ?? "staff"}</span>
          </div>
        )}
        {!collapsed && <ChangePasswordDialog />}
        <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
