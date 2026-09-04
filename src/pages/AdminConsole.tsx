import { Link } from "react-router-dom";
import {
  Building2, Crown, MonitorSmartphone, FileSpreadsheet, Gauge, History, KeyRound, LayoutGrid, Lock,
  Megaphone, Palette, ScrollText, Shield, ShieldCheck, Siren, Trash2, UserCog, Users,
  Activity, DatabaseBackup, FolderLock, Layers, Link2, MailCheck, Phone, Settings2, ShieldAlert, Unlock,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useRbac } from "@/hooks/useRbac";
import { SecurityHero } from "@/components/security/SecurityHero";
import { CapabilitySelfCheckPanel } from "@/components/admin/CapabilitySelfCheckPanel";
import { SystemInformationPanel } from "@/components/admin/SystemInformationPanel";
import AdminSecurityBand from "@/components/dashboard/AdminSecurityBand";
import RestrictedOperationsBand from "@/components/dashboard/RestrictedOperationsBand";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Tier = "admin" | "command";

interface ConsoleLink {
  title: string;
  description: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  tier: Tier;
}

interface ConsoleSection {
  title: string;
  description: string;
  items: ConsoleLink[];
}

interface ConsoleArea {
  key: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: ConsoleSection[];
}

/**
 * Centralized Admin Console — a single hub that gathers every sensitive
 * administrative surface, split into Security Settings and System Settings and
 * grouped along recognized information-security lines (identity, access,
 * logging and monitoring, data protection, configuration). The pages themselves
 * keep their own route-level and database-level authorization; this hub only
 * decides what to show.
 */
const AREAS: ConsoleArea[] = [
  {
    key: "security",
    title: "Security Settings",
    description: "Identity, access, monitoring, logging and data-protection controls.",
    icon: ShieldCheck,
    sections: [
      {
        title: "Authentication & MFA",
        description: "Password policy, two-factor enrolment and recovery of lost factors.",
        items: [
          { title: "Authentication & Password Policy", description: "Password rules, sign-in policy and application security thresholds.", url: "/settings?area=security&tab=app-settings", icon: KeyRound, tier: "admin" },
          { title: "Multi-Factor Authentication", description: "Enrol authenticator apps and manage backup codes.", url: "/settings?area=security&tab=2fa", icon: ShieldCheck, tier: "admin" },
          { title: "MFA Recovery Requests", description: "Review staff who lost their second factor.", url: "/settings?area=security&tab=mfa-recovery", icon: Unlock, tier: "admin" },
        ],
      },
      {
        title: "Role-based access control",
        description: "Roles, delegated command authority and per-role permission tuning.",
        items: [
          { title: "User Roles", description: "Assign and revoke application roles.", url: "/settings?area=security&tab=roles", icon: Shield, tier: "admin" },
          { title: "Role Assignments", description: "Manage every staff member's application role.", url: "/role-assignments", icon: UserCog, tier: "command" },
          { title: "Command Roles & Grants", description: "Assign command-tier roles and delegate individual capabilities.", url: "/command-roles", icon: Crown, tier: "command" },
          { title: "Permission Overrides", description: "Per-role permission fine-tuning.", url: "/settings?area=security&tab=permissions", icon: KeyRound, tier: "admin" },
          { title: "Admin Access Matrix", description: "Printable matrix of what each role can reach.", url: "/admin-access-matrix", icon: Shield, tier: "command" },
        ],
      },
      {
        title: "User access & permissions",
        description: "Approval queues that grant or change a person's access.",
        items: [
          { title: "Pending Staff Approvals", description: "Approve or merge staff records created from imports.", url: "/staff-approvals/pending", icon: ShieldCheck, tier: "command" },
          { title: "Account Approvals", description: "Create, reset and delete staff login accounts.", url: "/staff-approvals/accounts", icon: Users, tier: "admin" },
          { title: "Profile Change Approvals", description: "Review staff-submitted profile change requests.", url: "/staff-approvals/profile-changes", icon: ShieldCheck, tier: "command" },
        ],
      },
      {
        title: "Sessions, lockouts & device monitoring",
        description: "Active sessions, failed sign-ins and blocked devices.",
        items: [
          { title: "Session Management", description: "See active sessions and sign devices out of the system.", url: "/admin/sessions", icon: MonitorSmartphone, tier: "command" },
          { title: "Account Lockout Policy", description: "Failed sign-in thresholds and lockout windows.", url: "/settings?area=security&tab=lockouts", icon: ShieldAlert, tier: "admin" },
          { title: "Locked Accounts", description: "Unlock accounts with a recorded reason.", url: "/settings?area=security&tab=locked-accounts", icon: Unlock, tier: "admin" },
          { title: "Login Audit", description: "Timeline of failed and successful sign-in attempts.", url: "/settings?area=security&tab=login-audit", icon: History, tier: "admin" },
          { title: "Device & Presence Log", description: "Which devices are online and where they signed in from.", url: "/settings?area=security&tab=presence", icon: Activity, tier: "admin" },
          { title: "IP & Device Blocks", description: "Blocked addresses, rules, threat feeds and quarantine.", url: "/ip-blocks", icon: Siren, tier: "admin" },
        ],
      },
      {
        title: "Security alerts & incidents",
        description: "Intrusion prevention, alerting and incident follow-up.",
        items: [
          { title: "Firewall Settings", description: "File, URL, auth and WAF layer enforcement rules.", url: "/settings?area=security&tab=firewall", icon: ShieldCheck, tier: "admin" },
          { title: "Security Alerts", description: "Who gets notified, and for which severities.", url: "/settings?area=security&tab=firewall-alerts", icon: ShieldAlert, tier: "admin" },
          { title: "Security Monitoring", description: "Alerts on suspicious role changes, authorization failures and unusual file access.", url: "/security-monitoring", icon: ShieldAlert, tier: "admin" },
          { title: "Security Updates", description: "Outstanding security actions and hardening status.", url: "/settings?area=security&tab=security-updates", icon: ShieldCheck, tier: "admin" },
        ],
      },
      {
        title: "Audit logs",
        description: "Independent, append-only records of sensitive activity.",
        items: [
          { title: "Audit Log Dashboard", description: "Hash-chained system audit trail with verification.", url: "/audit-log", icon: ScrollText, tier: "command" },
          { title: "Security Audit Trail", description: "Anchored security events with chain verification.", url: "/settings?area=security&tab=security-audit", icon: History, tier: "admin" },
          { title: "Command Role Audit", description: "Every command-role assignment, change and revocation.", url: "/command-role-audit", icon: History, tier: "command" },
          { title: "Sensitive Access Log", description: "Reads of sensitive tables, per user and surface.", url: "/sensitive-access-log", icon: Lock, tier: "command" },
          { title: "Shift Rules Audit", description: "Changes to attendance windows and shift rules.", url: "/shift-window-audit", icon: ScrollText, tier: "command" },
        ],
      },
      {
        title: "Data protection & privacy",
        description: "Export controls, retention windows and recoverable deletions.",
        items: [
          { title: "HRM Export Controls", description: "Data-loss prevention on staff data exports.", url: "/settings?area=security&tab=hrm-dlp", icon: ShieldCheck, tier: "admin" },
          { title: "Retention Policy", description: "Audit and file retention windows.", url: "/announcements/retention", icon: ScrollText, tier: "admin" },
          { title: "Recycle Bin", description: "Restore or permanently purge deleted records.", url: "/recycle-bin", icon: Trash2, tier: "admin" },
        ],
      },
      {
        title: "File & upload security",
        description: "Screening of uploaded files and quarantined content.",
        items: [
          { title: "Quarantine Inbox", description: "Files held back by upload screening, with release requests.", url: "/quarantine", icon: FolderLock, tier: "command" },
          { title: "Backup & Recovery Security", description: "Backup schedules, integrity checks and restore audit.", url: "/settings?area=security&tab=backup", icon: DatabaseBackup, tier: "admin" },
        ],
      },
    ],
  },
  {
    key: "system",
    title: "System Settings",
    description: "Organization identity, application configuration, integrations and maintenance.",
    icon: Settings2,
    sections: [
      {
        title: "Organization & system information",
        description: "Command hierarchy, system details and build information.",
        items: [
          { title: "Command Structure", description: "Organizational units and key appointments.", url: "/org-structure", icon: Building2, tier: "command" },
          { title: "System Information", description: "Environment, version and database details.", url: "/settings?area=system&tab=system", icon: Gauge, tier: "admin" },
          { title: "Portfolios", description: "Portfolio definitions used across staff records.", url: "/settings?area=system&tab=portfolios", icon: Layers, tier: "admin" },
        ],
      },
      {
        title: "Branding & customization",
        description: "System identity, logos, theme, login screen and email branding.",
        items: [
          { title: "Branding Management", description: "Names, logos, favicon, theme colours, login screen, email branding and footer.", url: "/branding", icon: Palette, tier: "admin" },
          { title: "Interlink Branding", description: "Labels and identity for inter-agency correspondence.", url: "/settings?area=system&tab=interlink-brand", icon: Palette, tier: "admin" },
        ],
      },
      {
        title: "General application settings",
        description: "System-wide behaviour, thresholds and rotation defaults.",
        items: [
          { title: "Application Settings", description: "General system behaviour, limits and thresholds.", url: "/settings?area=system&tab=app-settings", icon: Settings2, tier: "admin" },
          { title: "Shift Rotation Settings", description: "Rotation groups, exclusions and overrides.", url: "/settings?area=system&tab=rotation", icon: Layers, tier: "admin" },
        ],
      },
      {
        title: "Notifications & email",
        description: "Announcement delivery and outbound email configuration.",
        items: [
          { title: "Announcements", description: "Publish org-wide or department notices with attachments.", url: "/announcements", icon: Megaphone, tier: "command" },
          { title: "Email Delivery Test", description: "Verify sender configuration and queue delivery.", url: "/settings?area=system&tab=email-test", icon: MailCheck, tier: "admin" },
        ],
      },
      {
        title: "Integrations & API",
        description: "Third-party platform connections and who may manage them.",
        items: [
          { title: "Shift Platform Connections", description: "Attendance integrations and sync history.", url: "/settings?area=system&tab=shift-connections", icon: Link2, tier: "admin" },
          { title: "Connection Permissions", description: "Which roles may connect, sync or disconnect platforms.", url: "/settings?area=system&tab=shift-conn-perms", icon: KeyRound, tier: "admin" },
        ],
      },
      {
        title: "Data import & export",
        description: "Bulk data loading and staff mapping.",
        items: [
          { title: "Roster Import", description: "Import duty rosters and auto-match staff.", url: "/roster/import", icon: FileSpreadsheet, tier: "command" },
          { title: "Guard PDF Import", description: "Import guard schedules from PDF exports.", url: "/guard-schedule/import", icon: FileSpreadsheet, tier: "command" },
          { title: "Staff Mapping Import", description: "Bulk import department, office and shift mappings.", url: "/staff-mapping-import", icon: Building2, tier: "admin" },
          { title: "Bio-Data Form Setup", description: "Manage dropdown lists, extra fields and extra tables on the personnel bio-data form.", url: "/biodata-form-setup", icon: FileSpreadsheet, tier: "admin" },

          { title: "Staff Accounts Bulk Create", description: "Generate login accounts for imported staff.", url: "/settings?area=system&tab=accounts", icon: Users, tier: "admin" },
        ],
      },
      {
        title: "Backup & maintenance",
        description: "Scheduled backups and system performance monitoring.",
        items: [
          { title: "System Backup", description: "Run and schedule backups with an audited history.", url: "/settings?area=system&tab=backup", icon: DatabaseBackup, tier: "admin" },
          { title: "RUM Analytics", description: "Real-user performance and error monitoring.", url: "/rum-analytics", icon: Gauge, tier: "command" },
          { title: "Phone Validation Rules", description: "Active Ghana and international number rules, with a troubleshooting checker.", url: "/admin/phone-validation", icon: Phone, tier: "admin" },
        ],
      },
    ],
  },
];

export default function AdminConsole() {
  const { isAdmin, canManageCommandTier, isAdminOrSupervisor, role } = useAuth();
  const { canPath } = useRbac();
  const allowed = isAdmin || canManageCommandTier || isAdminOrSupervisor;
  // Administration tier — the only roles allowed to see security, system
  // integrity and tactical operations data.
  const isAdminTier = role === "admin" || role === "oic" || role === "2ic";



  if (!allowed) {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Not authorized</AlertTitle>
        <AlertDescription>
          The Admin Console is available to System Administrators and command-tier officers.
        </AlertDescription>
      </Alert>
    );
  }

  // RBAC: a tile is shown only when the account can actually open its route.
  const visible = (item: ConsoleLink) =>
    (item.tier === "admin" ? isAdmin : true) && canPath(item.url.split("?")[0]);

  return (
    <div className="space-y-8">
      <SecurityHero
        icon={LayoutGrid}
        title="Admin Console"
        subtitle="Security and system administration, grouped along recognized information-security lines. Only functions you are authorized for are shown, and each destination independently enforces its own permissions."
      />

      {(isAdmin || canManageCommandTier) && <CapabilitySelfCheckPanel />}

      <SystemInformationPanel />

      {/* High-risk live data, moved off the general dashboard: security and
          intrusion metrics, system integrity, and tactical operations. */}
      {isAdminTier && (
        <div className="space-y-6">
          <AdminSecurityBand />
          <RestrictedOperationsBand />
        </div>
      )}


      {AREAS.map((area) => {
        const sections = area.sections
          .map((section) => ({ ...section, items: section.items.filter(visible) }))
          .filter((section) => section.items.length > 0);
        if (sections.length === 0) return null;
        return (
          <div key={area.key} className="space-y-4">
            <div className="flex items-start gap-3 border-b pb-3">
              <area.icon className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{area.title}</h2>
                <p className="text-sm text-muted-foreground">{area.description}</p>
              </div>
            </div>

            {sections.map((section) => (
              <section key={section.title} className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold tracking-tight">{section.title}</h3>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {section.items.map((item) => (
                    <Link key={item.url + item.title} to={item.url} className="group focus-visible:outline-none">
                      <Card className="h-full transition-colors group-hover:border-primary group-focus-visible:ring-2 group-focus-visible:ring-ring">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex items-center gap-2">
                              <item.icon className="h-4 w-4 text-primary" />
                              {item.title}
                            </span>
                            {item.tier === "admin" && <Badge variant="outline" className="text-[10px]">Admin</Badge>}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <CardDescription>{item.description}</CardDescription>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      })}
    </div>
  );
}
