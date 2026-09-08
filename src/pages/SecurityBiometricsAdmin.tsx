/**
 * Dedicated administrator screens for the biometric (passkey) security suite.
 *
 * Three tabs, each a standalone screen:
 *  - Enrollment: the policy switches + coverage report (who is enrolled,
 *    within grace, or overdue) plus the reminder job controls.
 *  - Credentials: every enrolled device, with audited revoke / reset actions.
 *  - Admin audit: the biometric event feed (enrollments, revokes, resets).
 *
 * All logic lives in the existing security cards; this page gives them their
 * own route so admins do not have to dig through System Settings.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, Fingerprint, KeyRound, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BiometricEnrollmentPolicyCard } from "@/components/security/BiometricEnrollmentPolicyCard";
import { BiometricReminderCard } from "@/components/security/BiometricReminderCard";
import { BiometricAdminPanel } from "@/components/security/BiometricAdminPanel";
import { BiometricAuditLogCard } from "@/components/security/BiometricAuditLogCard";

type TabKey = "enrollment" | "credentials" | "audit";

const TABS: { value: TabKey; label: string; icon: typeof Fingerprint; iconClass: string }[] = [
  { value: "enrollment", label: "Enrollment", icon: Fingerprint, iconClass: "text-primary" },
  { value: "credentials", label: "Credentials", icon: KeyRound, iconClass: "text-chart-5" },
  { value: "audit", label: "Admin Audit", icon: History, iconClass: "text-emerald-600" },
];

export default function SecurityBiometricsAdmin() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = (searchParams.get("tab") as TabKey) ?? "enrollment";
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.value === initial) ? initial : "enrollment"
  );

  if (!isAdmin) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Only System Administrators can open the biometric security screens.
      </div>
    );
  }

  const change = (value: string) => {
    setTab(value as TabKey);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ShieldCheck}
        title="Biometric Security Administration"
        subtitle="Set the enrollment requirement, chase outstanding staff, manage enrolled devices and review every biometric action taken by administrators."
      />

      <Tabs value={tab} onValueChange={change}>
        <div className="overflow-x-auto">
          <TabsList>
            {TABS.map(({ value, label, icon: Icon, iconClass }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="enrollment" className="space-y-4 mt-4">
          <BiometricEnrollmentPolicyCard />
          <BiometricReminderCard />
        </TabsContent>

        <TabsContent value="credentials" className="space-y-4 mt-4">
          <BiometricAdminPanel />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4 mt-4">
          <BiometricAuditLogCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
