import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import { FileText, Stamp, BookOpen, ClipboardList, Shield, HelpCircle } from "lucide-react";
import VisaApplications from "@/components/frontdesk/VisaApplications";
import VisaExtensions from "@/components/frontdesk/VisaExtensions";
import PassportApplications from "@/components/frontdesk/PassportApplications";
import OfficialApplications from "@/components/frontdesk/OfficialApplications";
import EnquiryApplications from "@/components/frontdesk/EnquiryApplications";
import AuditLog from "@/components/frontdesk/AuditLog";

const ALLOWED_ROLES = ["admin", "front_desk", "oic", "2ic", "staff_officer", "supervisor", "shift_supervisor", "deputy_shift_supervisor"];

export default function FrontDesk() {
  const { role } = useAuth();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "visa";
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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="visa" className="gap-1 text-xs sm:text-sm">
            <Stamp className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Visa Apps
          </TabsTrigger>
          <TabsTrigger value="extensions" className="gap-1 text-xs sm:text-sm">
            <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" /> Extensions
          </TabsTrigger>
          <TabsTrigger value="passport" className="gap-1 text-xs sm:text-sm">
            <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Passport
          </TabsTrigger>
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
        <TabsContent value="visa"><VisaApplications /></TabsContent>
        <TabsContent value="extensions"><VisaExtensions /></TabsContent>
        <TabsContent value="passport"><PassportApplications /></TabsContent>
        <TabsContent value="official"><OfficialApplications /></TabsContent>
        <TabsContent value="enquiry"><EnquiryApplications /></TabsContent>
        <TabsContent value="audit"><AuditLog /></TabsContent>
      </Tabs>
    </div>
  );
}
