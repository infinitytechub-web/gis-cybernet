import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stamp, FileText, BookOpen, ClipboardList } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import ProcessingVisaApplications from "@/components/processing/ProcessingVisaApplications";
import ProcessingVisaExtensions from "@/components/processing/ProcessingVisaExtensions";
import ProcessingPassportApplications from "@/components/processing/ProcessingPassportApplications";
import ProcessingAuditLog from "@/components/processing/ProcessingAuditLog";

const ALLOWED_ROLES = ["admin", "front_desk", "oic", "2ic", "supervisor", "shift_supervisor", "deputy_shift_supervisor"];

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Processing</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="visa" className="gap-1 text-xs sm:text-sm">
            <Stamp className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Visa Apps
          </TabsTrigger>
          <TabsTrigger value="extensions" className="gap-1 text-xs sm:text-sm">
            <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" /> Extensions
          </TabsTrigger>
          <TabsTrigger value="passport" className="gap-1 text-xs sm:text-sm">
            <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Passport
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1 text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Audit Log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="visa"><ProcessingVisaApplications /></TabsContent>
        <TabsContent value="extensions"><ProcessingVisaExtensions /></TabsContent>
        <TabsContent value="passport"><ProcessingPassportApplications /></TabsContent>
        <TabsContent value="audit"><ProcessingAuditLog /></TabsContent>
      </Tabs>
    </div>
  );
}