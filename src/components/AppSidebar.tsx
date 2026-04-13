import {
  LayoutDashboard, Users, Building2, Award, Clock, CalendarCheck,
  CalendarOff, Calendar, ArrowRightLeft, LogOut, Shield, ClipboardCheck, BarChart3, KeyRound, Contact, CalendarDays, Megaphone, Stamp, Activity, FileSearch
} from "lucide-react";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NavLink } from "@/components/NavLink";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import gisLogo from "@/assets/gis-logo.jpeg";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, iconColor: "text-blue-600 dark:text-blue-400" },
  { title: "Staff / Employees", url: "/staff", icon: Users, iconColor: "text-emerald-600 dark:text-emerald-400" },
  { title: "Staff Directory", url: "/directory", icon: Contact, iconColor: "text-teal-600 dark:text-teal-400" },
  { title: "Departments", url: "/departments", icon: Building2, iconColor: "text-purple-600 dark:text-purple-400" },
  { title: "Roles / Designations", url: "/roles", icon: Award, iconColor: "text-amber-600 dark:text-amber-400" },
  { title: "Office Shifts", url: "/shifts", icon: Clock, iconColor: "text-indigo-600 dark:text-indigo-400" },
  { title: "Duty Roster", url: "/roster", icon: CalendarDays, iconColor: "text-cyan-600 dark:text-cyan-400" },
  { title: "Attendance", url: "/attendance", icon: CalendarCheck, iconColor: "text-green-600 dark:text-green-400" },
  { title: "Leave / Pass Requests", url: "/leave", icon: CalendarOff, iconColor: "text-orange-600 dark:text-orange-400" },
  { title: "Holidays", url: "/holidays", icon: Calendar, iconColor: "text-rose-600 dark:text-rose-400" },
  { title: "Postings, Transfers & Reassignment", url: "/postings", icon: ArrowRightLeft, iconColor: "text-violet-600 dark:text-violet-400" },
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

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, role } = useAuth();
  const { org_name, system_label } = useAppSettings();

  const { data: processingCount } = useQuery({
    queryKey: ["processing-sidebar-count"],
    queryFn: async () => {
      const [v, e, p] = await Promise.all([
        supabase.from("visa_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
        supabase.from("visa_extensions").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
        supabase.from("passport_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "processing"]),
      ]);
      return (v.count ?? 0) + (e.count ?? 0) + (p.count ?? 0);
    },
    refetchInterval: 30_000,
  });

  const { data: frontDeskCount } = useQuery({
    queryKey: ["frontdesk-sidebar-count"],
    queryFn: async () => {
      const [v, e, p] = await Promise.all([
        supabase.from("visa_applications").select("id", { count: "exact", head: true }),
        supabase.from("visa_extensions").select("id", { count: "exact", head: true }),
        supabase.from("passport_applications").select("id", { count: "exact", head: true }),
      ]);
      return (v.count ?? 0) + (e.count ?? 0) + (p.count ?? 0);
    },
    refetchInterval: 30_000,
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={gisLogo} alt="GIS" className="h-10 w-10 rounded-full object-cover border border-sidebar-border" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-primary-foreground">{org_name.length > 20 ? org_name.slice(0, 20) + "…" : org_name}</span>
              <span className="text-xs text-sidebar-foreground/70">{system_label}</span>
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
                      <item.icon className={`mr-2 h-4 w-4 ${item.iconColor}`} />
                      {!collapsed && <span>{item.title}</span>}
                      {item.url === "/processing" && !collapsed && processingCount != null && processingCount > 0 && (
                        <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
                          {processingCount}
                        </Badge>
                      )}
                      {item.url === "/front-desk" && !collapsed && frontDeskCount != null && frontDeskCount > 0 && (
                        <Badge variant="secondary" className="ml-auto h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
                          {frontDeskCount}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(role === "admin" || role === "supervisor") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50">Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                        <item.icon className={`mr-2 h-4 w-4 ${item.iconColor}`} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
