import { Link } from "react-router-dom";
import {
  Building2, Crown, FileSpreadsheet, Gauge, History, KeyRound, LayoutGrid, Lock,
  Megaphone, Palette, ScrollText, Shield, ShieldCheck, Siren, Trash2, UserCog, Users,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { SecurityHero } from "@/components/security/SecurityHero";
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

/**
 * Centralized Admin Console — a single hub that gathers every sensitive
 * administrative surface. The pages themselves keep their own route-level and
 * database-level authorization; this hub only decides what to show.
 */
const SECTIONS: ConsoleSection[] = [
  {
    title: "Identity & access",
    description: "Roles, delegated command privileges and the access matrix.",
    items: [
      { title: "Command Roles & Grants", description: "Assign command-tier roles and delegate individual capabilities.", url: "/command-roles", icon: Crown, tier: "command" },
      { title: "Role Assignments", description: "Manage every staff member's application role.", url: "/role-assignments", icon: UserCog, tier: "command" },
      { title: "Admin Access Matrix", description: "Printable matrix of what each role can reach.", url: "/admin-access-matrix", icon: Shield, tier: "command" },
      { title: "Permission Overrides", description: "Per-role permission fine-tuning in System Settings.", url: "/settings", icon: KeyRound, tier: "admin" },
    ],
  },
  {
    title: "Staff administration",
    description: "Approvals, onboarding queues and bulk staff data.",
    items: [
      { title: "Pending Staff Approvals", description: "Approve or merge staff records created from imports.", url: "/staff-approvals/pending", icon: ShieldCheck, tier: "command" },
      { title: "Account Approvals", description: "Create, reset and delete staff login accounts.", url: "/staff-approvals/accounts", icon: Users, tier: "admin" },
      { title: "Profile Change Approvals", description: "Review staff-submitted profile change requests.", url: "/staff-approvals/profile-changes", icon: ShieldCheck, tier: "command" },
      { title: "Staff Mapping Import", description: "Bulk import department, office and shift mappings.", url: "/staff-mapping-import", icon: Building2, tier: "admin" },
    ],
  },
  {
    title: "Branding & communications",
    description: "System identity, logos, theme and announcements.",
    items: [
      { title: "Branding Management", description: "Names, logos, favicon, theme colours, contacts and footer.", url: "/settings?tab=branding", icon: Palette, tier: "admin" },
      { title: "Announcements", description: "Publish org-wide or department notices with attachments.", url: "/announcements", icon: Megaphone, tier: "command" },
    ],
  },
  {
    title: "Security & audit",
    description: "Audit trails, intrusion prevention and sensitive access logs.",
    items: [
      { title: "Audit Log Dashboard", description: "Hash-chained system audit trail with verification.", url: "/audit-log", icon: ScrollText, tier: "command" },
      { title: "Command Role Audit", description: "Every command-role assignment, change and revocation.", url: "/command-role-audit", icon: History, tier: "command" },
      { title: "Sensitive Access Log", description: "Reads of sensitive tables, per user and surface.", url: "/sensitive-access-log", icon: Lock, tier: "command" },
      { title: "IP Blocks & Firewall", description: "Blocked addresses, rules, threat feeds and quarantine.", url: "/ip-blocks", icon: Siren, tier: "admin" },
    ],
  },
  {
    title: "Operations & data",
    description: "Imports, retention, recovery and performance.",
    items: [
      { title: "Roster Import", description: "Import duty rosters and auto-match staff.", url: "/roster/import", icon: FileSpreadsheet, tier: "command" },
      { title: "Guard PDF Import", description: "Import guard schedules from PDF exports.", url: "/guard-schedule/import", icon: FileSpreadsheet, tier: "command" },
      { title: "Retention Policy", description: "Audit and file retention windows.", url: "/retention-policy", icon: ScrollText, tier: "admin" },
      { title: "Recycle Bin", description: "Restore or permanently purge deleted records.", url: "/recycle-bin", icon: Trash2, tier: "admin" },
      { title: "RUM Analytics", description: "Real-user performance and error monitoring.", url: "/rum-analytics", icon: Gauge, tier: "command" },
    ],
  },
];

export default function AdminConsole() {
  const { isAdmin, canManageCommandTier, isAdminOrSupervisor } = useAuth();
  const allowed = isAdmin || canManageCommandTier || isAdminOrSupervisor;

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

  const visible = (item: ConsoleLink) => (item.tier === "admin" ? isAdmin : true);

  return (
    <div className="space-y-6">
      <SecurityHero
        icon={LayoutGrid}
        title="Admin Console"
        subtitle="One place for every administrative and security surface in the system. Each destination still enforces its own permissions."
      />

      {SECTIONS.map((section) => {
        const items = section.items.filter(visible);
        if (items.length === 0) return null;
        return (
          <section key={section.title} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
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
        );
      })}
    </div>
  );
}
