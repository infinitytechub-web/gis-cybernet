import {
  LayoutDashboard, Users, Building2, Award, Clock, CalendarCheck,
  CalendarOff, Calendar, ArrowRightLeft, LogOut, Shield, ShieldCheck, ClipboardCheck, BarChart3, Contact, CalendarDays, Megaphone, Stamp, Activity, FileSearch, ShieldAlert, Crosshair, Package, Lock, Briefcase, FolderLock, Trash2, Link2, Globe2, ScrollText, Ban, Network, Crown, History, FileSpreadsheet, Heart, FileHeart, UserCog, Inbox, Gauge, LayoutGrid, MonitorSmartphone, Truck, MonitorDot, Radio, Palette, ChevronRight, CreditCard, Landmark
, Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NavLink } from "@/components/NavLink";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useBranding } from "@/hooks/useBranding";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import gisLogo from "@/assets/gis-logo-192.webp";
import { INTERLINK_LABELS } from "@/lib/interlink-types";
import { roleLabel, COMMAND_TIER_ROLES } from "@/lib/role-labels";
import { useInterlinkBranding } from "@/hooks/useInterlinkBranding";
import { useConfidentialityCommands } from "@/hooks/useConfidentialityCommands";
import { useRbac } from "@/hooks/useRbac";
import {
  ALL_APPLICATION_TABLES,
  FRONT_DESK_TABLES,
  PROCESSING_TABLES,
  sumPending,
} from "@/lib/application-queues";
import { Pin as PinIcon, Settings as SettingsIcon } from "lucide-react";
import { navDescription } from "@/lib/nav-descriptions";

const commandItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, iconColor: "text-blue-600 dark:text-blue-400" },
  { title: "Command Console", url: "/command-console", icon: MonitorDot, iconColor: "text-[hsl(220,80%,40%)] dark:text-[hsl(220,80%,70%)]" },
  { title: "Analytics", url: "/analytics", icon: Activity, iconColor: "text-pink-600 dark:text-pink-400" },
  { title: "Reports", url: "/reports", icon: BarChart3, iconColor: "text-fuchsia-600 dark:text-fuchsia-400" },
];

const personnelItems = [
  { title: "Staff / Employees", url: "/staff", icon: Users, iconColor: "text-emerald-600 dark:text-emerald-400" },
  { title: "Staff Directory", url: "/directory", icon: Contact, iconColor: "text-teal-600 dark:text-teal-400" },
  { title: "Departments", url: "/departments", icon: Building2, iconColor: "text-purple-600 dark:text-purple-400" },
  { title: "Roles / Designations", url: "/roles", icon: Award, iconColor: "text-amber-600 dark:text-amber-400" },
];

const myDutyItems = [
  { title: "My Shift Tracker", url: "/my-shift", icon: Activity, iconColor: "text-pink-600 dark:text-pink-400" },
  { title: "In-Cab Console", url: "/in-cab", icon: Radio, iconColor: "text-sky-700 dark:text-sky-400" },
];

const attendanceItems = [
  { title: "Attendance", url: "/attendance", icon: CalendarCheck, iconColor: "text-green-600 dark:text-green-400" },
  { title: "Office Shifts", url: "/shifts", icon: Clock, iconColor: "text-indigo-600 dark:text-indigo-400" },
];

const rosterItems = [
  { title: "Duty Roster", url: "/roster", icon: CalendarDays, iconColor: "text-cyan-600 dark:text-cyan-400" },
  { title: "Guard Schedule", url: "/guard-schedule", icon: ShieldCheck, iconColor: "text-emerald-700 dark:text-emerald-300" },
];

const leaveItems = [
  { title: "Leave / Pass Requests", url: "/leave", icon: CalendarOff, iconColor: "text-orange-600 dark:text-orange-400" },
  { title: "Holidays", url: "/holidays", icon: Calendar, iconColor: "text-rose-600 dark:text-rose-400" },
];

const paymentsLoansItems = [
  { title: "Payments", url: "/payments", icon: CreditCard, iconColor: "text-teal-600 dark:text-teal-400" },
  { title: "Loans", url: "/loans", icon: Landmark, iconColor: "text-amber-700 dark:text-amber-300" },
];

const postingItems = [
  { title: "Postings & Transfers", url: "/postings", icon: ArrowRightLeft, iconColor: "text-violet-600 dark:text-violet-400" },
  { title: "Transfer History", url: "/postings/history", icon: ArrowRightLeft, iconColor: "text-violet-700 dark:text-violet-300" },
];

const appraisalItems = [
  { title: "Staff Appraisals", url: "/appraisals", icon: Award, iconColor: "text-amber-600 dark:text-amber-400" },
];


const staffApprovalsItem = { title: "Staff Approvals", url: "/staff-approvals", icon: ShieldCheck, iconColor: "text-emerald-700 dark:text-emerald-300" };
const shiftWindowAuditItem = { title: "Shift Rules Audit", url: "/shift-window-audit", icon: ScrollText, iconColor: "text-amber-700 dark:text-amber-300" };
const securityAuditLogItem = { title: "Security Audit Log", url: "/security-audit-log", icon: ScrollText, iconColor: "text-amber-700 dark:text-amber-300" };
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

const healthItems = [
  { title: "Health Lab+", url: "/health-lab", icon: FileHeart, iconColor: "text-emerald-700 dark:text-emerald-300" },
];

const allStaffItems = [
  { title: "My Profile", url: "/my-profile", icon: UserCog, iconColor: "text-emerald-700 dark:text-emerald-300" },
  { title: "Biometric Enrollment", url: "/biometric-enrollment", icon: Fingerprint, iconColor: "text-indigo-600 dark:text-indigo-400" },
  { title: "My Portal", url: "/my-portal", icon: Inbox, iconColor: "text-sky-600 dark:text-sky-400" },
  { title: "Excuse Duty Form", url: "/excuse-duty", icon: Heart, iconColor: "text-rose-600 dark:text-rose-400" },
  { title: "My Submissions", url: "/excuse-duty/mine", icon: Heart, iconColor: "text-rose-500 dark:text-rose-300" },
];

const logisticsItems = [
  { title: "Stores & Inventory", url: "/stores", icon: Package, iconColor: "text-amber-700 dark:text-amber-500" },
  { title: "Unit Dashboard", url: "/unit-dashboard", icon: LayoutGrid, iconColor: "text-emerald-700 dark:text-emerald-300" },
  { title: "Fleet Management", url: "/fleet", icon: Truck, iconColor: "text-blue-700 dark:text-blue-400" },
];


const financeItems = [
  { title: "Procurement Unit", url: "/procurement", icon: Briefcase, iconColor: "text-emerald-700 dark:text-emerald-400" },
];

// ── Monitoring, Evaluation, Project & Performance Management ───────────────
// Entry tile plus four themed sub-menus so the 20 destinations stay scannable.
const meEntryItems = [
  { title: "Command Center", url: "/me/command-center", icon: MonitorDot, iconColor: "text-primary" },
];

const meStrategyItems = [
  { title: "Strategic Objectives", url: "/me/objectives", icon: Crosshair, iconColor: "text-blue-700 dark:text-blue-300" },
  { title: "Programs", url: "/me/programs", icon: Briefcase, iconColor: "text-indigo-600 dark:text-indigo-400" },
  { title: "Projects", url: "/me/projects", icon: Briefcase, iconColor: "text-emerald-700 dark:text-emerald-300" },
  { title: "Workplans", url: "/me/workplans", icon: CalendarDays, iconColor: "text-cyan-700 dark:text-cyan-300" },
];

const meMeasurementItems = [
  { title: "KPIs & Indicators", url: "/me/measures", icon: Gauge, iconColor: "text-teal-600 dark:text-teal-400" },
  { title: "Results Framework", url: "/me/results", icon: BarChart3, iconColor: "text-amber-600 dark:text-amber-400" },
  { title: "Field Reports", url: "/me/field-reports", icon: FileSearch, iconColor: "text-purple-700 dark:text-purple-300" },
  { title: "GIS Map", url: "/me/gis-map", icon: Globe2, iconColor: "text-sky-600 dark:text-sky-400" },
  { title: "Evidence", url: "/me/evidence", icon: FileSpreadsheet, iconColor: "text-slate-600 dark:text-slate-400" },
];

const meAssuranceItems = [
  { title: "Risks & Issues", url: "/me/risks", icon: ShieldAlert, iconColor: "text-red-600 dark:text-red-400" },
  { title: "Incidents", url: "/me/incidents", icon: ShieldAlert, iconColor: "text-orange-600 dark:text-orange-400" },
  { title: "Corrective Actions", url: "/me/actions", icon: ClipboardCheck, iconColor: "text-emerald-700 dark:text-emerald-300" },
  { title: "Approvals", url: "/me/approvals", icon: ShieldCheck, iconColor: "text-emerald-600 dark:text-emerald-400" },
];

const meResourceItems = [
  { title: "Resources", url: "/me/resources", icon: Users, iconColor: "text-blue-600 dark:text-blue-400" },
  { title: "Budgets", url: "/me/budgets", icon: Landmark, iconColor: "text-chart-1" },
  { title: "Reports", url: "/me/reports", icon: ScrollText, iconColor: "text-fuchsia-700 dark:text-fuchsia-300" },
  { title: "Analytics", url: "/me/analytics", icon: BarChart3, iconColor: "text-teal-700 dark:text-teal-300" },
  { title: "M&E Audit", url: "/me/audit", icon: History, iconColor: "text-primary" },
  { title: "M&E Administration", url: "/me/administration", icon: SettingsIcon, iconColor: "text-slate-600 dark:text-slate-400" },
];

// Administration is grouped into sub-menus so no single list becomes a wall of links.
const adminEntryItems = [
  { title: "Admin Console", url: "/admin", icon: LayoutGrid, iconColor: "text-primary" },
];

const adminApprovalItems = [
  { title: "Pending Staff Approvals", url: "/staff-approvals/pending", icon: ShieldCheck, iconColor: "text-emerald-700 dark:text-emerald-300" },
  { title: "Account Approvals", url: "/staff-approvals/accounts", icon: ShieldCheck, iconColor: "text-emerald-700 dark:text-emerald-300" },
  { title: "Profile Change Approvals", url: "/staff-approvals/profile-changes", icon: ShieldCheck, iconColor: "text-emerald-700 dark:text-emerald-300" },
  { title: "Shift Rotation Approvals", url: "/shift-rotation-approvals", icon: ShieldCheck, iconColor: "text-secondary" },
];

const adminAccessItems = [
  { title: "Command Roles", url: "/command-roles", icon: Crown, iconColor: "text-amber-600 dark:text-amber-400" },
  { title: "Role Assignments", url: "/role-assignments", icon: UserCog, iconColor: "text-amber-700 dark:text-amber-300" },
  { title: "Admin Access Matrix", url: "/admin-access-matrix", icon: Shield, iconColor: "text-emerald-600 dark:text-emerald-400" },
  { title: "Command Structure", url: "/org-structure", icon: Network, iconColor: "text-blue-700 dark:text-blue-300" },
  { title: "Session Management", url: "/admin/sessions", icon: MonitorSmartphone, iconColor: "text-cyan-700 dark:text-cyan-300" },
  { title: "Trusted 2FA Devices", url: "/admin/trusted-devices", icon: MonitorSmartphone, iconColor: "text-emerald-700 dark:text-emerald-300" },
];

const adminSecurityItems = [
  { title: "Audit Log Dashboard", url: "/audit-log", icon: ScrollText, iconColor: "text-fuchsia-700 dark:text-fuchsia-300" },
  { title: "Command Role Audit", url: "/command-role-audit", icon: History, iconColor: "text-primary" },
];

const adminDataItems = [
  { title: "Roster Import", url: "/roster/import", icon: FileSpreadsheet, iconColor: "text-cyan-700 dark:text-cyan-300" },
  { title: "Guard PDF Import", url: "/guard-schedule/import", icon: FileSpreadsheet, iconColor: "text-emerald-700 dark:text-emerald-300" },
  { title: "Staff Mapping Import", url: "/staff-mapping-import", icon: Building2, iconColor: "text-purple-700 dark:text-purple-300" },
  { title: "RUM Analytics", url: "/rum-analytics", icon: Gauge, iconColor: "text-teal-600 dark:text-teal-400" },
];

const adminConfigItems = [
  { title: "Announcements", url: "/announcements", icon: Megaphone, iconColor: "text-red-600 dark:text-red-400" },
  { title: "Branding Settings", url: "/branding", icon: Palette, iconColor: "text-chart-1" },
  { title: "Security Settings", url: "/settings?area=security", icon: ShieldCheck, iconColor: "text-emerald-700 dark:text-emerald-300" },
  { title: "System Settings", url: "/settings?area=system", icon: SettingsIcon, iconColor: "text-slate-600 dark:text-slate-400" },
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
/** A click-to-expand parent menu inside a sidebar group. */
type NavSection = { label: string; icon: any; iconColor: string; items: NavItem[] };

const slugifyLabel = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const OPEN_GROUPS_KEY = "cybernet.sidebar.openGroups";

const readOpenGroups = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(OPEN_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
};

// Workforce Operations sub-menus — keeps the longest group scroll-free.
const workforceSections: NavSection[] = [
  { label: "My Duty", icon: Activity, iconColor: "text-pink-600 dark:text-pink-400", items: myDutyItems },
  { label: "Attendance & Shifts", icon: CalendarCheck, iconColor: "text-green-600 dark:text-green-400", items: attendanceItems },
  { label: "Rosters & Schedules", icon: CalendarDays, iconColor: "text-cyan-600 dark:text-cyan-400", items: rosterItems },
  { label: "Leave & Holidays", icon: CalendarOff, iconColor: "text-orange-600 dark:text-orange-400", items: leaveItems },
  { label: "Payments & Loans", icon: CreditCard, iconColor: "text-teal-600 dark:text-teal-400", items: paymentsLoansItems },
  { label: "Postings & Transfers", icon: ArrowRightLeft, iconColor: "text-violet-600 dark:text-violet-400", items: postingItems },
];


export function AppSidebar() {
  const { state, setOpen, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, role } = useAuth();
  const { canPath } = useRbac();

  // Parent menus remember whether the user left them open, per browser profile.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(readOpenGroups);

  /** The branch holding the current route always opens, whatever was stored. */
  const isGroupOpen = (label: string, items: NavItem[]) =>
    items.some((item) => isActiveRoute(item.url)) || openGroups[label] === true;

  const toggleGroup = (label: string, items: NavItem[]) => {
    const next = { ...openGroups, [label]: !isGroupOpen(label, items) };
    setOpenGroups(next);
    try {
      localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — state stays in memory only */
    }
  };


  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };
  const { org_name } = useAppSettings();
  const branding = useBranding();
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
    const channel = supabase.channel("sidebar-badge-realtime");
    ALL_APPLICATION_TABLES.forEach((table) => {
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
    queryFn: () => sumPending(PROCESSING_TABLES),
    refetchInterval: 30_000,
  });

  const { data: frontDeskCount } = useQuery({
    queryKey: ["frontdesk-sidebar-count"],
    queryFn: () => sumPending(FRONT_DESK_TABLES),
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
    const path = url.split("?")[0];
    if (path === "/") return location.pathname === "/";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const renderItem = (item: NavItem) => {
    const active = isActiveRoute(item.url);
    const badgeCount =
      item.badge === "processing" ? processingCount :
      item.badge === "frontdesk" ? frontDeskCount : null;
    const ariaLabel = collapsed
      ? `${item.title}${active ? ", current page" : ""}${badgeCount ? `, ${badgeCount} pending` : ""}`
      : undefined;
    const description = navDescription(item.url);
    const link = (
      <NavLink
        to={item.url}
        end={item.url === "/"}
        onClick={handleNavClick}
        aria-current={active ? "page" : undefined}
        aria-label={ariaLabel}
        className={`group/nav relative hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar rounded-md transition-colors ${
          active
            ? "ring-2 ring-sidebar-primary bg-sidebar-primary/10 text-sidebar-primary"
            : ""
        }`}
        activeClassName="font-medium"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-primary opacity-0 transition-all duration-150 group-hover/nav:h-4/5 group-hover/nav:opacity-100"
        />
        <item.icon className={`mr-2 h-4 w-4 ${item.iconColor}`} aria-hidden="true" />
        {!collapsed && <span>{item.title}</span>}
        {renderBadge(item)}
      </NavLink>
    );
    return (
      <SidebarMenuItem key={item.title}>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <SidebarMenuButton asChild>{link}</SidebarMenuButton>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className={`max-w-[16rem] ${
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-primary"
                : ""
            }`}
          >
            <span className="block font-semibold">{item.title}</span>
            {description && (
              <span className="mt-0.5 block text-xs font-normal opacity-90">{description}</span>
            )}
            {active && <span className="sr-only"> (current page)</span>}
          </TooltipContent>
        </Tooltip>
      </SidebarMenuItem>
    );
  };

  /** Pending-work badge shown on a collapsed parent so notifications stay visible. */
  const parentBadge = (items: NavItem[]) => {
    const total = items.reduce((sum, it) => {
      if (it.badge === "processing") return sum + (processingCount ?? 0);
      if (it.badge === "frontdesk") return sum + (frontDeskCount ?? 0);
      return sum;
    }, 0);
    if (total <= 0) return null;
    return (
      <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
        {total}
      </Badge>
    );
  };

  /** Click-to-expand parent menu wrapping its own submenu items. */
  const renderCollapsibleParent = (
    label: string,
    items: NavItem[],
    ParentIcon: any,
    iconColor: string,
  ) => {
    const open = isGroupOpen(label, items);
    const contentId = `nav-group-${slugifyLabel(label)}`;
    const description = navDescription(label);
    return (
      <Collapsible key={label} open={open} onOpenChange={() => toggleGroup(label, items)}>
        <SidebarMenuItem>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  aria-expanded={open}
                  aria-controls={contentId}
                  className="group/nav hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <ParentIcon className={`mr-2 h-4 w-4 ${iconColor}`} aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  {!open && parentBadge(items)}
                  <ChevronRight
                    aria-hidden="true"
                    className={`ml-auto h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[16rem]">
              <span className="block font-semibold">{label}</span>
              <span className="mt-0.5 block text-xs font-normal opacity-90">
                {description ?? `${items.length} item${items.length === 1 ? "" : "s"}`}
              </span>
            </TooltipContent>
          </Tooltip>
          <CollapsibleContent id={contentId}>
            <SidebarMenu className="ml-3 border-l border-sidebar-border pl-2">
              {items.map(renderItem)}
            </SidebarMenu>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  /**
   * Renders one sidebar group. Groups with more than four permitted items — or
   * with explicit sub-menus — become click-to-expand parents; short groups stay
   * flat. In icon-collapsed mode everything renders flat so icons stay reachable.
   */
  const renderGroup = (label: string, allItems: NavItem[], sections: NavSection[] = []) => {
    // RBAC: hide destinations the signed-in account cannot reach, and drop the
    // whole group when nothing in it is permitted.
    const permitted = (items: NavItem[]) => items.filter((item) => canPath(item.url.split("?")[0]));
    const items = permitted(allItems);
    const liveSections = sections
      .map((s) => ({ ...s, items: permitted(s.items) }))
      .filter((s) => s.items.length > 0);
    const total = items.length + liveSections.reduce((n, s) => n + s.items.length, 0);
    if (total === 0) return null;

    const flatten = [...items, ...liveSections.flatMap((s) => s.items)];
    const useAccordion = !collapsed && (liveSections.length > 0 || items.length > 4);

    return (
      <SidebarGroup key={label}>
        {(!useAccordion || liveSections.length > 0) && (
          <SidebarGroupLabel className="text-sidebar-foreground/50">{label}</SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {!useAccordion && flatten.map(renderItem)}
            {useAccordion && liveSections.length === 0 &&
              renderCollapsibleParent(label, items, items[0].icon, items[0].iconColor)}
            {useAccordion && liveSections.length > 0 && (
              <>
                {items.map(renderItem)}
                {liveSections.map((section) =>
                  renderCollapsibleParent(section.label, section.items, section.icon, section.iconColor),
                )}
              </>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };


  return (
    <TooltipProvider>
    <Sidebar collapsible="icon" aria-label="Primary navigation" aria-expanded={!collapsed}>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={branding.logo_url || gisLogo} alt={branding.company_name} width={40} height={40} decoding="async" className="h-10 w-10 rounded-full object-cover border border-sidebar-border" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-primary-foreground">{org_name.length > 20 ? org_name.slice(0, 20) + "…" : org_name}</span>
              <span className="text-xs text-sidebar-foreground/70">{branding.system_label}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label={collapsed ? "Collapsed navigation menu" : "Expanded navigation menu"}>
        {renderGroup("Command & Control", commandItems)}
        {renderGroup("Personnel Management", personnelItems)}
        {renderGroup(
          "Workforce Operations",
          [],
          [
            ...workforceSections,
            {
              label: "Appraisals & Approvals",
              icon: Award,
              iconColor: "text-amber-600 dark:text-amber-400",
              items:
                (role === "admin" || role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer" || role === "supervisor" || role === "shift_supervisor" || role === "deputy_shift_supervisor")
                  ? [...appraisalItems, staffApprovalsItem]
                  : appraisalItems,
            },
          ],
        )}
        {renderGroup("Immigration Services", immigrationItems)}
        {renderGroup("Security & Enforcement", securityItems)}
        {renderGroup("Logistics", logisticsItems)}
        {renderGroup("My Forms", allStaffItems)}
        {(role === "admin" || role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer" || role === "supervisor") && renderGroup("Healthcare", healthItems)}
        {renderGroup("Finance & Procurement", financeItems)}
        {renderGroup("M&E and Project Management", meEntryItems, [
          { label: "Strategy & Delivery", icon: Crosshair, iconColor: "text-blue-700 dark:text-blue-300", items: meStrategyItems },
          { label: "Measurement & Evidence", icon: Gauge, iconColor: "text-teal-600 dark:text-teal-400", items: meMeasurementItems },
          { label: "Risk & Assurance", icon: ShieldAlert, iconColor: "text-red-600 dark:text-red-400", items: meAssuranceItems },
          { label: "Resources & Oversight", icon: Landmark, iconColor: "text-chart-1", items: meResourceItems },
        ])}

        {(role === "admin" || role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer" || role === "supervisor") && renderGroup("Integrations", integrationsItems)}
        {(role === "admin" || role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer") && renderGroup("Confidential", liveCommandVaultItems)}
        {role === "admin" && renderGroup("Confidentiality", confidentialityItems)}
        {(role === "admin" || role === "oic") && renderGroup("Recovery", recycleBinItems)}
        {(role === "admin" || role === "supervisor" || role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer") &&
          renderGroup("Administration", adminEntryItems, [
            { label: "Approvals", icon: ShieldCheck, iconColor: "text-emerald-700 dark:text-emerald-300", items: adminApprovalItems },
            { label: "Access & Roles", icon: Crown, iconColor: "text-amber-600 dark:text-amber-400", items: adminAccessItems },
            {
              label: "Security & Audit",
              icon: ScrollText,
              iconColor: "text-fuchsia-700 dark:text-fuchsia-300",
              items:
                role === "admin"
                  ? [...adminSecurityItems, securityAuditLogItem, sensitiveAccessLogItem, shiftWindowAuditItem, ipBlocksItem]
                  : (role === "oic" || role === "2ic" || role === "head_of_administration" || role === "chief_staff_officer" || role === "staff_officer")
                    ? [...adminSecurityItems, securityAuditLogItem, sensitiveAccessLogItem, shiftWindowAuditItem]
                    : adminSecurityItems,
            },
            { label: "Data & Imports", icon: FileSpreadsheet, iconColor: "text-cyan-700 dark:text-cyan-300", items: adminDataItems },
            { label: "Configuration", icon: SettingsIcon, iconColor: "text-slate-600 dark:text-slate-400", items: adminConfigItems },
          ])}
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
