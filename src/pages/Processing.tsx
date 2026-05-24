import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stamp, FileText, ShieldCheck, IdCard, ClipboardList, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ProcessingVisaApplications from "@/components/processing/ProcessingVisaApplications";
import ProcessingVisaExtensions from "@/components/processing/ProcessingVisaExtensions";
import ProcessingPermits from "@/components/processing/ProcessingPermits";
import ApprovalsQueue from "@/components/processing/ApprovalsQueue";
import ProcessingAuditLog from "@/components/processing/ProcessingAuditLog";

const ALLOWED_ROLES = ["admin", "front_desk", "oic", "2ic", "staff_officer", "supervisor", "shift_supervisor", "deputy_shift_supervisor", "head_of_processing", "deputy_head_of_processing"];
const APPROVALS_ROLES = ["admin", "oic", "2ic", "staff_officer", "supervisor", "shift_supervisor", "deputy_shift_supervisor", "head_of_processing", "deputy_head_of_processing"];
const VISA_TYPES = ["tourist", "business", "work", "transit", "student", "diplomatic"];

export default function Processing() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "visa";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({
    applicant_name: "", passport_number: "", nationality: "",
    visa_type: "tourist", entry_date: "", exit_date: "", purpose: "",
  });

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const createApplication = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        entry_date: form.entry_date || null,
        exit_date: form.exit_date || null,
        status: "submitted",
        processed_by: user?.id,
      };
      const { error } = await supabase.from("visa_applications").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visa-applications"] });
      qc.invalidateQueries({ queryKey: ["processing-visa-applications"] });
      toast.success("Application created");
      setForm({ applicant_name: "", passport_number: "", nationality: "", visa_type: "tourist", entry_date: "", exit_date: "", purpose: "" });
      setNewOpen(false);
      setActiveTab("visa");
    },
    onError: (e: any) => toast.error(e.message || "Failed to create"),
  });

  if (role && !ALLOWED_ROLES.includes(role)) {
    return <Navigate to="/" replace />;
  }

  const showApprovals = !!role && APPROVALS_ROLES.includes(role);
  const colsClass = showApprovals ? "grid w-full grid-cols-5" : "grid w-full grid-cols-4";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-secondary">Processing</h1>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1"><Plus className="h-4 w-4" /> New Application</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Visa Application</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createApplication.mutate(); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Applicant Name *</Label><Input value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} required /></div>
                <div><Label>Passport Number *</Label><Input value={form.passport_number} onChange={(e) => setForm({ ...form, passport_number: e.target.value })} required /></div>
                <div><Label>Nationality *</Label><Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} required /></div>
                <div><Label>Visa Type</Label>
                  <Select value={form.visa_type} onValueChange={(v) => setForm({ ...form, visa_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{VISA_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Entry Date</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
                <div><Label>Exit Date</Label><Input type="date" value={form.exit_date} onChange={(e) => setForm({ ...form, exit_date: e.target.value })} /></div>
              </div>
              <div><Label>Purpose</Label><Textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} rows={2} /></div>
              <Button type="submit" className="w-full" disabled={createApplication.isPending}>
                {createApplication.isPending ? "Saving…" : "Submit Application"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
        {showApprovals && <TabsContent value="approvals"><ApprovalsQueue /></TabsContent>}
        <TabsContent value="audit"><ProcessingAuditLog /></TabsContent>
      </Tabs>
    </div>
  );
}
