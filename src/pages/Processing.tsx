import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stamp, FileText, BookOpen, ClipboardList, Shield, HelpCircle, ShieldCheck, IdCard } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import ProcessingVisaApplications from "@/components/processing/ProcessingVisaApplications";
import ProcessingVisaExtensions from "@/components/processing/ProcessingVisaExtensions";
import ProcessingPassportApplications from "@/components/processing/ProcessingPassportApplications";
import ProcessingOfficialApplications from "@/components/processing/ProcessingOfficialApplications";
import ProcessingEnquiryApplications from "@/components/processing/ProcessingEnquiryApplications";
import ProcessingPermits from "@/components/processing/ProcessingPermits";
import ProcessingAuditLog from "@/components/processing/ProcessingAuditLog";
import ApprovalsQueue from "@/components/processing/ApprovalsQueue";

const ALLOWED_ROLES = ["admin", "front_desk", "oic", "2ic", "staff_officer", "supervisor", "shift_supervisor", "deputy_shift_supervisor", "head_of_processing", "deputy_head_of_processing"];
const APPROVALS_ROLES = ["admin", "oic", "2ic", "staff_officer", "supervisor", "shift_supervisor", "deputy_shift_supervisor", "head_of_processing", "deputy_head_of_processing"];

export default function Processing() {
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

  const showApprovals = !!role && APPROVALS_ROLES.includes(role);
  const colsClass = showApprovals ? "grid w-full grid-cols-8" : "grid w-full grid-cols-7";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Processing</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={colsClass}>
          <TabsTrigger value="visa" className="gap-1 text-xs sm:text-sm">
            <Stamp className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Visa Apps
          </TabsTrigger>
          <TabsTrigger value="extensions" className="gap-1 text-xs sm:text-sm">
            <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" /> Extensions
          </TabsTrigger>
          <TabsTrigger value="permits" className="gap-1 text-xs sm:text-sm">
            <IdCard className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Permits
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
          {showApprovals && (
            <TabsTrigger value="approvals" className="gap-1 text-xs sm:text-sm">
              <ShieldCheck className="h-4 w-4 text-rose-600 dark:text-rose-400" /> Approvals
            </TabsTrigger>
          )}
          <TabsTrigger value="audit" className="gap-1 text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Audit Log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="visa"><ProcessingVisaApplications /></TabsContent>
        <TabsContent value="extensions"><ProcessingVisaExtensions /></TabsContent>
        <TabsContent value="permits"><ProcessingPermits /></TabsContent>
        <TabsContent value="passport"><ProcessingPassportApplications /></TabsContent>
        <TabsContent value="official"><ProcessingOfficialApplications /></TabsContent>
        <TabsContent value="enquiry"><ProcessingEnquiryApplications /></TabsContent>
        {showApprovals && <TabsContent value="approvals"><ApprovalsQueue /></TabsContent>}
        <TabsContent value="audit"><ProcessingAuditLog /></TabsContent>
      </Tabs>
    </div>
  );
}
