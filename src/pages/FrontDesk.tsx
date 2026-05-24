import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Shield, HelpCircle } from "lucide-react";
import OfficialApplications from "@/components/frontdesk/OfficialApplications";
import EnquiryApplications from "@/components/frontdesk/EnquiryApplications";
import AuditLog from "@/components/frontdesk/AuditLog";

const ALLOWED_ROLES = ["admin", "front_desk", "oic", "2ic", "staff_officer", "supervisor", "shift_supervisor", "deputy_shift_supervisor"];

export default function FrontDesk() {
  const { role } = useAuth();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "official";
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  if (role && !ALLOWED_ROLES.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Front Desk</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="official" className="gap-1 text-xs sm:text-sm">
            <Shield className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /> Official
          </TabsTrigger>
          <TabsTrigger value="enquiry" className="gap-1 text-xs sm:text-sm">
            <HelpCircle className="h-4 w-4 text-lime-600 dark:text-lime-400" /> Enquiry
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1 text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Audit Log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="official"><OfficialApplications /></TabsContent>
        <TabsContent value="enquiry"><EnquiryApplications /></TabsContent>
        <TabsContent value="audit"><AuditLog /></TabsContent>
      </Tabs>
    </div>
  );
}
