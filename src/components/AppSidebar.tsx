import {
  LayoutDashboard, Users, Building2, Award, Clock, CalendarCheck,
  CalendarOff, Calendar, ArrowRightLeft, LogOut, Shield, ShieldCheck, ClipboardCheck, BarChart3, Contact, CalendarDays, Megaphone, Stamp, Activity, FileSearch, ShieldAlert, Crosshair, Package, Lock, Briefcase, FolderLock, Trash2, Link2, Globe2, ScrollText, Ban, Network, Crown, History
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import gisLogo from "@/assets/gis-logo.jpeg";
import { INTERLINK_LABELS } from "@/lib/interlink-types";
import { roleLabel, COMMAND_TIER_ROLES } from "@/lib/role-labels";
import { useInterlinkBranding } from "@/hooks/useInterlinkBranding";
import { useConfidentialityCommands } from "@/hooks/useConfidentialityCommands";
import { Pin as PinIcon, Settings as SettingsIcon } from "lucide-react";

const commandItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, iconColor: "text-blue-600 dark:text-blue-400" },
  { title: "Analytics", url: "/analytics", icon: Activity, iconColor: "text-pink-600 dark:text-pink-400" },
  { title: "Reports", url: "/reports", icon: BarChart3, iconColor: "text-fuchsia-600 dark:text-fuchsia-400" },
];

const personnelItems = [
  { title: "Staff / Employees", url: "/staff", icon: Users, iconColor: "text-emerald-600 dark:text-emerald-400" },
  { title: "Staff Directory", url: "/directory", icon: Contact, iconColor: "text-teal-600 dark:text-teal-400" },
  { title: "Departments", url: "/departments", icon: Building2, iconColor: "text-purple-600 dark:text-purple-400" },
  { title: "Roles / Designations", url: "/roles", icon: Award, iconColor: "text-amber-600 dark:text-amber-400" },
];

const workforceItems = [
  { title: "My Shift Tracker", url: "/my-shift", icon: Activity, iconColor: "text-pink-600 dark:text-pink-400" },
  { title: "Attendance", url: "/attendance", icon: CalendarCheck, iconColor: "text-green-600 dark:text-green-400" },
  { title: "Office Shifts", url: "/shifts", icon: Clock, iconColor: "text-indigo-600 dark:text-indigo-400" },
  { title: "Duty Roster", url: "/roster", icon: CalendarDays, iconColor: "text-cyan-600 dark:text-cyan-400" },
  { title: "Leave / Pass Requests", url: "/leave", icon: CalendarOff, iconColor: "text-orange-600 dark:text-orange-400" },
  { title: "Holidays", url: "/holidays", icon: Calendar, iconColor: "text-rose-600 dark:text-rose-400" },
  { title: "Postings & Transfers", url: "/postings", icon: ArrowRightLeft, iconColor: "text-violet-600 dark:text-violet-400" },
];

const staffApprovalsItem = { title: "Staff Approvals", url: "/staff-approvals", icon: ShieldCheck, iconColor: "text-emerald-700 dark:text-emerald-300" };
const shiftWindowAuditItem = { title: "Shift Rules Audit", url: "/shift-window-audit", icon: ScrollText, iconColor: "text-amber-700 dark:text-amber-300" };
const sensitiveAccessLogItem = { title: "Sensitive Access Log", url: "/sensitive-access-log", icon: ScrollText, iconColor: "text-rose-700 dark:text-rose-300" };
const ipBlocksItem = { title: "IP & Device Blocks", url: "/ip-blocks", icon: Ban, iconColor: "text-destructive" };

const immigrationItems = [
  { title: "Front Desk", url: "/front-desk", icon: Stamp, iconColor: "text-lime-600 dark:text-lime-400", badge: "frontdesk" as const },
  { title: "Processing", url: "/processing", icon: FileSearch, iconColor: "text-amber-600 dark:text-amber-400", badge: "processing" as const },
];

const securityItems = [
  { title: "Operations", url: "/operations", icon: Crosshair, iconColor: "text-orange-600 dark:text-orange-400" },
  { title: "Holding Center", url: "/holding", icon: Lock, iconColor: "text-red-700 dark:text-red-500" },
  { title: "Enforcement", url: "/enforcement", icon: ShieldAlert, iconColor: "text-red-600 dark:text-red-400" },
  { title: "IPSE", url: "/ipse", icon: Shield, iconColor: "text-[hsl(82,40%,30%)] dark:text-[hsl(82,50%,65%)]" },
  { title: "MISD / CYBER", url: "/misd", icon: Shield, iconColor: "text-purple-700 dark:text-purple-300" },
  { title: "Compliance", url: "/compliance", icon: ClipboardCheck, iconColor: "text-sky-600 dark:text-sky-400" },
];

const logisticsItems = [
  { title: "Stores & Inventory", url: "/stores", icon: Package, iconColor: "text-amber-700 dark:text-amber-500" },
];

const financeItems = [
  { title: "Procurement Unit", url: "/procurement", icon: Briefcase, iconColor: "text-emerald-700 dark:text-emerald-400" },
];

const adminItems = [
  { title: "Announcements", url: "/announcements", icon: Megaphone, iconColor: "text-red-600 dark:text-red-400" },
  { title: "Command Roles", url: "/command-roles", icon: Crown, iconColor: "text-amber-600 dark:text-amber-400" },
  { title: "Admin Access Matrix", url: "/admin-access-matrix", icon: Shield, iconColor: "text-emerald-600 dark:text-emerald-400" },
  { title: "Command Role Audit", url: "/command-role-audit", icon: History, iconColor: "text-primary" },
  { title: "Settings", url: "/settings", icon: Shield, iconColor: "text-slate-600 dark:text-slate-400" },
];

// Restricted to command tier — manages tenant-wide shift platform integrations.
const integrationsItems = [
  { title: "Shift Connections", url: "/attendance/connections", icon: Link2, iconColor: "text-sky-600 dark:text-sky-400" },
];

const commandVaultItems = [
  { title: "Command Vault", url: "/command-vault", icon: FolderLock, iconColor: "text-[hsl(220,80%,40%)] dark:text-[hsl(220,80%,70%)]" },
  { title: "GPS Hub", url: "/command-vault/gps", icon: Globe2, iconColor: "text-[hsl(180,70%,40%)] dark:text-[hsl(180,70%,65%)]" },
  { title: INTERLINK_LABELS.nav, url: "/interlink", icon: Network, iconColor: "text-indigo-600 dark:text-indigo-400" },
];

const recycleBinItems = [
  { title: "Recycle Bin", url: "/recycle-bin", icon: Trash2, iconColor: "text-destructive" },
];

type NavItem = { title: string; url: string; icon: any; iconColor: string; badge?: "frontdesk" | "processing" };

export function AppSidebar() {
  const { state, setOpen, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, role } = useAuth();

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };
  const { org_name, system_label } = useAppSettings();
  const interlinkBranding = useInterlinkBranding();
  const liveCommandVaultItems = commandVaultItems.map((it) =>
    it.url === "/interlink" ? { ...it, title: interlinkBranding.nav } : it
  );
  const queryClient = useQueryClient();
  const { data: confCommands = [] } = useConfidentialityCommands();

  // Build Confidentiality submenu (admin only). Pinned commands first, then alphabetical.
  const confidentialityItems: NavItem[] = [
    ...confCommands.map((c) => ({
      title: c.name,
      url: `/command/${c.slug}`,
      icon: c.pinned ? PinIcon : Crown,
      iconColor: c.pinned
        ? "text-amber-600 dark:text-amber-400"
        : "text-[hsl(220,80%,40%)] dark:text-[hsl(220,80%,70%)]",
    })),
    { title: "Manage commands", url: "/commands", icon: SettingsIcon, iconColor: "text-slate-600 dark:text-slate-400" },
  ];

  // Realtime: invalidate sidebar badge counts on any change to application tables
  useEffect(() => {
    const tables = ["visa_applications", "visa_extensions", "passport_applications", "official_applications", "enquiry_applications"];
    const channel = supabase.channel("sidebar-badge-realtime");
    tables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        queryClient.invalidateQueries({ queryKey: ["processing-sidebar-count"] });
        queryClient.invalidateQueries({ queryKey: ["frontdesk-sidebar-count"] });
      });
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: processingCount } = useQuery({
    queryKey: ["processing-sidebar-count"],
    queryFn: async () => {
      const [v, e, p, o, eq] = await Promise.all([
        supabase.from("visa_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
        supabase.from("visa_extensions").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
        supabase.from("passport_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "processing"]),
        supabase.from("official_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
        supabase.from("enquiry_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
      ]);
      return (v.count ?? 0) + (e.count ?? 0) + (p.count ?? 0) + (o.count ?? 0) + (eq.count ?? 0);
    },
    refetchInterval: 30_000,
  });

  const { data: frontDeskCount } = useQuery({
    queryKey: ["frontdesk-sidebar-count"],
    queryFn: async () => {
      const [v, e, p, o, eq] = await Promise.all([
        supabase.from("visa_applications").select("id", { count: "exact", head: true }),
        supabase.from("visa_extensions").select("id", { count: "exact", head: true }),
        supabase.from("passport_applications").select("id", { count: "exact", head: true }),
        supabase.from("official_applications").select("id", { count: "exact", head: true }),
        supabase.from("enquiry_applications").select("id", { count: "exact", head: true }),
      ]);
      return (v.count ?? 0) + (e.count ?? 0) + (p.count ?? 0) + (o.count ?? 0) + (eq.count ?? 0);
    },
    refetchInterval: 30_000,
  });

  const renderBadge = (item: NavItem) => {
    if (item.badge === "processing" && !collapsed && processingCount != null && processingCount > 0) {
      return (
        <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
          {processingCount}
        </Badge>
      );
    }
    if (item.badge === "frontdesk" && !collapsed && frontDeskCount != null && frontDeskCount > 0) {
      return (
        <Badge variant="secondary" className="ml-auto h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
          {frontDeskCount}
        </Badge>
      );
    }
    return null;
  };

  const isActiveRoute = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname === url || location.pathname.startsWith(url + "/");
  };

  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup key={label}>
      <SidebarGroupLabel className="text-sidebar-foreground/50">{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActiveRoute(item.url);
            const badgeCount =
              item.badge === "processing" ? processingCount :
              item.badge === "frontdesk" ? frontDeskCount : null;
            const ariaLabel = collapsed
              ? `${item.title}${active ? ", current page" : ""}${badgeCount ? `, ${badgeCount} pending` : ""}`
              : undefined;
            const link = (
              <NavLink
                to={item.url}
                end={item.url === "/"}
                onClick={handleNavClick}
                aria-current={active ? "page" : undefined}
                aria-label={ariaLabel}
                title={collapsed ? undefined : item.title}
                className={`hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar rounded-md transition-colors ${
                  active
                    ? "ring-2 ring-sidebar-primary bg-sidebar-primary/10 text-sidebar-primary"
                    : ""
                }`}
                activeClassName="font-medium"
              >
                <item.icon className={`mr-2 h-4 w-4 ${item.iconColor}`} aria-hidden="true" />
                {!collapsed && <span>{item.title}</span>}
                {renderBadge(item)}
              </NavLink>
            );
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  {collapsed ? (
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className={
                          active
                            ? "font-semibold bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-primary"
                            : "font-medium"
                        }
                      >
                        {item.title}
                        {active && <span className="sr-only"> (current page)</span>}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <TooltipProvider>
    <Sidebar collapsible="icon" aria-label="Primary navigation" aria-expanded={!collapsed}>
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

      <SidebarContent role="navigation" aria-label={collapsed ? "Collapsed navigation menu" : "Expanded navigation menu"}>
        {renderGroup("Command & Control", commandItems)}
        {renderGroup("Personnel Management", personnelItems)}
        {renderGroup(
          "Workforce Operations",
          (role === "admin" || role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer" || role === "supervisor" || role === "shift_supervisor" || role === "deputy_shift_supervisor")
            ? [...workforceItems, staffApprovalsItem]
            : workforceItems,
        )}
        {renderGroup("Immigration Services", immigrationItems)}
        {renderGroup("Security & Enforcement", securityItems)}
        {renderGroup("Logistics", logisticsItems)}
        {renderGroup("Finance & Procurement", financeItems)}

        {(role === "admin" || role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer" || role === "supervisor") && renderGroup("Integrations", integrationsItems)}
        {(role === "admin" || role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer") && renderGroup("Confidential", liveCommandVaultItems)}
        {role === "admin" && renderGroup("Confidentiality", confidentialityItems)}
        {(role === "admin" || role === "oic") && renderGroup("Recovery", recycleBinItems)}
        {(role === "admin" || role === "supervisor" || role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer") &&
          renderGroup(
            "Administration",
            (role === "admin")
              ? [...adminItems, shiftWindowAuditItem, sensitiveAccessLogItem, ipBlocksItem]
              : (role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer")
                ? [...adminItems, shiftWindowAuditItem, sensitiveAccessLogItem]
                : adminItems,
          )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="mb-2">
            <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
              <Shield className="h-3 w-3" />
              <span>Signed in as</span>
            </div>
            <Badge
              variant="outline"
              className={`mt-1 text-[10px] font-medium ${
                COMMAND_TIER_ROLES.includes(role as any)
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : ""
              }`}
            >
              {roleLabel(role)}
            </Badge>
          </div>
        )}
        {!collapsed && <ChangePasswordDialog />}
        <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
    </TooltipProvider>
  );
}
