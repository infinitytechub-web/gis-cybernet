import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Network, Send, Users, ScrollText, BarChart3, Plus, Trash2, FileText, AlertTriangle,
  CheckCircle2, Mail, Building2, Globe, Lock, Globe2, Loader2, Download, RefreshCw,
  FileSpreadsheet, FileType, Sparkles, CalendarClock, FileCog, ShieldCheck, MailCheck, History, KeyRound
} from "lucide-react";
import { exportReport, ExportFormat } from "@/lib/export-utils";
import { InterlinkPermissionsMatrix } from "@/components/interlink/InterlinkPermissionsMatrix";
import BirthdayWidget from "@/components/dashboard/BirthdayWidget";
import { exportDispatchesCSV, exportDispatchesXLSX, exportDispatchesPDF, exportDispatchesJSON } from "@/lib/interlink-export";
import {
  INTERLINK_LABELS,
  REPORT_KIND_LABELS, SCOPE_META, type InterlinkReportKind, type InterlinkScope,
} from "@/lib/interlink-types";
import { useInterlinkBranding } from "@/hooks/useInterlinkBranding";
import { SchedulesTab } from "@/components/interlink/SchedulesTab";
import { AttachmentRulesTab } from "@/components/interlink/AttachmentRulesTab";
import { ApprovalsTab } from "@/components/interlink/ApprovalsTab";
import { EmailStatusPanel } from "@/components/interlink/EmailStatusPanel";
import { csvCellQuoted } from "@/lib/csv-safe";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 5;

// ───────────────────────────────────────────────────────────────────────────────
// Page

export default function Interlink() {
  const { isAdminOrSupervisor, user } = useAuth();
  const branding = useInterlinkBranding();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = searchParams.get("tab") ?? "compose";

  if (!isAdminOrSupervisor) {
    return (
      <div className="p-6">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-destructive" />
              Restricted Module
            </CardTitle>
            <CardDescription>
              The Interlink System is restricted to the command tier (Admin, OIC, 2IC, Chief Staff Officer).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2 md:p-4">
      {/* Colorful header */}
      <div className="rounded-xl p-5 text-white shadow-lg bg-green-600">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-white/20 p-2.5">
            <Network className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              {branding.title}
              <Sparkles className="h-4 w-4 opacity-80" />
            </h1>
            <p className="text-sm text-white/90">
              {branding.tagline}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur">Secure</Badge>
            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur">Audited</Badge>
            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur">Realtime</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <BirthdayWidget />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList className="flex flex-wrap h-auto w-full md:w-auto">
          <TabsTrigger value="compose" className="gap-1.5"><Send className="h-4 w-4" />Compose</TabsTrigger>
          <TabsTrigger value="approvals" className="gap-1.5"><ShieldCheck className="h-4 w-4" />Approvals</TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1.5"><CalendarClock className="h-4 w-4" />Schedules</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5"><FileCog className="h-4 w-4" />Rules</TabsTrigger>
          <TabsTrigger value="recipients" className="gap-1.5"><Users className="h-4 w-4" />Recipients</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="h-4 w-4" />Audit Trail</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-4 w-4" />Analytics</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5"><KeyRound className="h-4 w-4" />Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="mt-4"><ComposeTab userId={user?.id ?? ""} /></TabsContent>
        <TabsContent value="approvals" className="mt-4"><ApprovalsTab /></TabsContent>
        <TabsContent value="schedules" className="mt-4"><SchedulesTab userId={user?.id ?? ""} /></TabsContent>
        <TabsContent value="rules" className="mt-4"><AttachmentRulesTab userId={user?.id ?? ""} /></TabsContent>
        <TabsContent value="recipients" className="mt-4"><RecipientsTab userId={user?.id ?? ""} /></TabsContent>
        <TabsContent value="audit" className="mt-4 space-y-4">
          <EmailStatusPanel />
          <AuditTab />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4"><AnalyticsTab /></TabsContent>
        <TabsContent value="permissions" className="mt-4"><InterlinkPermissionsMatrix /></TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSE TAB — pick reports + recipients + dispatch

function ComposeTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Exclude<InterlinkScope, "mixed">>("extranet");
  const [reportKind, setReportKind] = useState<InterlinkReportKind>("daily");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());
  const [adhocEmails, setAdhocEmails] = useState("");
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<{ name: string; base64: string; size: number }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  // ── Data sources

  const { data: reports = [] } = useQuery({
    queryKey: ["interlink-approved-reports", reportKind],
    queryFn: async () => {
      let q = supabase
        .from("report_uploads")
        .select("id, title, category, file_name, file_path, file_type, file_size, report_date, approved_at")
        .eq("approval_status", "approved")
        .order("approved_at", { ascending: false })
        .limit(50);
      if (reportKind === "daily" || reportKind === "weekly" || reportKind === "monthly" || reportKind === "annual") {
        q = q.eq("category", reportKind);
      } else if (reportKind === "staff") {
        q = q.ilike("title", "%staff%");
      }
      // 'all' and 'custom' fetch latest 50 across categories
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["interlink-departments-with-emails"],
    queryFn: async () => {
      const { data: depts } = await supabase.from("departments").select("id, name").order("name");
      // Pull a representative email per department from profiles
      const ids = (depts ?? []).map((d) => d.id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("department_id, email")
        .in("department_id", ids)
        .not("email", "is", null);
      const grouped = new Map<string, string[]>();
      (profs ?? []).forEach((p: any) => {
        if (!p.department_id || !p.email) return;
        const arr = grouped.get(p.department_id) ?? [];
        if (!arr.includes(p.email)) arr.push(p.email);
        grouped.set(p.department_id, arr);
      });
      return (depts ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        emails: grouped.get(d.id) ?? [],
      }));
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["interlink-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_contacts")
        .select("id, display_name, command_or_unit, email, scope")
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: lists = [] } = useQuery({
    queryKey: ["interlink-lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_lists")
        .select("id, name, description, scope, member_emails")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Recipient resolution

  const allRecipientEmails = useMemo(() => {
    const set = new Set<string>();
    departments.forEach((d) => {
      if (selectedDeptIds.has(d.id)) d.emails.forEach((e: string) => set.add(e.toLowerCase()));
    });
    contacts.forEach((c: any) => {
      if (selectedContactIds.has(c.id)) set.add(c.email.toLowerCase());
    });
    lists.forEach((l: any) => {
      if (selectedListIds.has(l.id)) (l.member_emails ?? []).forEach((e: string) => set.add(e.toLowerCase()));
    });
    adhocEmails
      .split(/[,;\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
      .forEach((e) => set.add(e));
    return Array.from(set);
  }, [departments, contacts, lists, selectedDeptIds, selectedContactIds, selectedListIds, adhocEmails]);

  // ── Generate fresh report (Word/PDF/Excel/CSV) from live data

  async function handleGenerateFresh(fmt: ExportFormat) {
    setGenerating(true);
    try {
      let title = REPORT_KIND_LABELS[reportKind];
      let headers: string[] = [];
      let rows: string[][] = [];
      const today = new Date().toISOString().split("T")[0];
      let startDate = today;
      const endDate = today;
      if (reportKind === "weekly") {
        const d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().split("T")[0];
      } else if (reportKind === "monthly") {
        const d = new Date(); d.setMonth(d.getMonth() - 1); startDate = d.toISOString().split("T")[0];
      } else if (reportKind === "annual") {
        const d = new Date(); d.setFullYear(d.getFullYear() - 1); startDate = d.toISOString().split("T")[0];
      }

      if (reportKind === "staff") {
        const { data } = await supabase
          .from("profiles")
          .select("staff_id, last_name, first_name, unit, shift_group, gender, status, phone, ranks(abbreviation), departments(name)")
          .order("last_name");
        headers = ["Staff ID", "Last Name", "First Name", "Rank", "Department", "Unit", "Shift", "Gender", "Status", "Phone"];
        rows = (data ?? []).map((s: any) => [
          s.staff_id ?? "—", s.last_name ?? "", s.first_name ?? "",
          s.ranks?.abbreviation ?? "—", s.departments?.name ?? "—",
          s.unit ?? "—", s.shift_group ?? "—", s.gender ?? "—", s.status ?? "—", s.phone ?? "—",
        ]);
      } else if (reportKind === "all") {
        const { data } = await supabase
          .from("report_uploads")
          .select("title, category, report_date, file_name, approval_status")
          .order("report_date", { ascending: false })
          .limit(500);
        title = "All Reports Summary";
        headers = ["Title", "Category", "Report Date", "File", "Status"];
        rows = (data ?? []).map((r: any) => [r.title, r.category, r.report_date, r.file_name, r.approval_status]);
      } else {
        const { data } = await supabase
          .from("attendances")
          .select("date, status, profiles(staff_id, first_name, last_name)")
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date", { ascending: false });
        title = `${REPORT_KIND_LABELS[reportKind]} (${startDate} → ${endDate})`;
        headers = ["Date", "Staff ID", "Name", "Status"];
        rows = (data ?? []).map((a: any) => [
          a.date,
          a.profiles?.staff_id ?? "—",
          `${a.profiles?.last_name ?? ""}, ${a.profiles?.first_name ?? ""}`,
          a.status,
        ]);
      }

      // Generate file in-memory by using the export pipeline. Since exportReport
      // triggers download directly, we replicate the relevant pieces here:
      const filename = `Interlink_${reportKind}_${today}`;
      const blob = await buildReportBlob(fmt, { title, headers, rows, filename });
      const base64 = await blobToBase64(blob);
      const ext = fmt === "excel" ? "xlsx" : fmt === "word" ? "doc" : fmt;
      const fileName = `${filename}.${ext}`;
      setGeneratedFiles((prev) => [...prev, { name: fileName, base64, size: blob.size }]);
      toast.success(`Generated ${fileName}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }

  // ── Extra file uploads

  function handleAddFiles(files: FileList | null) {
    if (!files) return;
    const next: File[] = [...extraFiles];
    let total = next.reduce((s, f) => s + f.size, 0);
    for (const f of Array.from(files)) {
      if (next.length >= MAX_FILES) { toast.error(`Max ${MAX_FILES} extra files`); break; }
      if (f.size > MAX_FILE_BYTES) { toast.error(`${f.name}: exceeds 5MB`); continue; }
      if (total + f.size > MAX_TOTAL_BYTES) { toast.error("Total attachments exceed 15MB"); break; }
      next.push(f); total += f.size;
    }
    setExtraFiles(next);
  }

  // ── Dispatch

  async function handleDispatch() {
    if (!subject.trim()) return toast.error("Subject is required");
    if (allRecipientEmails.length === 0) return toast.error("Pick at least one recipient");

    // Build attachments: selected approved reports (download from storage) +
    // generated files + extra uploads.
    const attachments: { filename: string; content_base64: string; size: number }[] = [];

    setSending(true);
    try {
      // 1) Approved reports from storage
      for (const id of selectedReportIds) {
        const r = reports.find((x: any) => x.id === id);
        if (!r) continue;
        const { data: fileBlob, error } = await supabase.storage.from("reports").download(r.file_path);
        if (error || !fileBlob) { toast.error(`Could not fetch ${r.file_name}`); continue; }
        const b64 = await blobToBase64(fileBlob);
        attachments.push({ filename: r.file_name, content_base64: b64, size: fileBlob.size });
      }
      // 2) Generated files
      generatedFiles.forEach((g) => attachments.push({ filename: g.name, content_base64: g.base64, size: g.size }));
      // 3) Extra uploads
      for (const f of extraFiles) {
        const b64 = await fileToBase64(f);
        attachments.push({ filename: f.name, content_base64: b64, size: f.size });
      }

      if (attachments.length === 0) {
        const proceed = confirm("No files attached. Send the message body only?");
        if (!proceed) { setSending(false); return; }
      }

      // 4) Pre-create dispatch row (status pending)
      const { data: dispatchRow, error: dispatchErr } = await supabase
        .from("interlink_dispatches")
        .insert({
          performed_by: userId,
          scope,
          subject,
          message,
          recipient_emails: allRecipientEmails,
          recipient_count: allRecipientEmails.length,
          attachment_names: attachments.map((a) => a.filename),
          attachment_count: attachments.length,
          total_attachment_bytes: attachments.reduce((s, a) => s + a.size, 0),
          report_kind: reportKind,
          status: "pending",
        })
        .select("id")
        .single();
      if (dispatchErr) throw dispatchErr;

      // 5) Invoke send-record-email in bulk mode. First attachment is the
      //    primary; rest are extra_attachments.
      const primary = attachments[0] ?? {
        filename: "interlink-message.txt",
        content_base64: btoa(message || subject),
        size: 1,
      };
      const extras = attachments.slice(1);

      const { data: result, error: sendErr } = await supabase.functions.invoke("send-record-email", {
        body: {
          recipients: allRecipientEmails,
          bulk: true,
          subject,
          message: message || subject,
          attachment_base64: primary.content_base64,
          attachment_filename: primary.filename,
          record_kind: `interlink:${reportKind}`,
          record_id: dispatchRow.id,
          extra_attachments: extras.map((e) => ({
            filename: e.filename,
            content_base64: e.content_base64,
            size: e.size,
          })),
        },
      });

      if (sendErr) throw sendErr;

      const summary = result?.summary ?? { sent: 0, failed: allRecipientEmails.length };
      const finalStatus = summary.failed === 0 ? "sent" : summary.sent === 0 ? "failed" : "partial";

      // 6) Update dispatch row with results
      await supabase
        .from("interlink_dispatches")
        .update({
          status: finalStatus,
          sent_count: summary.sent ?? 0,
          failed_count: summary.failed ?? 0,
          results: result?.results ?? [],
        })
        .eq("id", dispatchRow.id);

      queryClient.invalidateQueries({ queryKey: ["interlink-audit"] });
      queryClient.invalidateQueries({ queryKey: ["interlink-dashboard-stats"] });

      if (finalStatus === "sent") {
        toast.success(`Dispatched to ${summary.sent} recipient${summary.sent === 1 ? "" : "s"}`);
      } else if (finalStatus === "partial") {
        toast.warning(`Partial: ${summary.sent} sent, ${summary.failed} failed`);
      } else {
        toast.error(`Failed: 0/${allRecipientEmails.length} delivered`);
      }

      // Reset form (keep recipients for convenience)
      setSubject(""); setMessage(""); setSelectedReportIds(new Set());
      setExtraFiles([]); setGeneratedFiles([]);
    } catch (e: any) {
      toast.error(e.message || "Dispatch failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* LEFT: Compose form */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-indigo-600" /> Dispatch details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Scope</Label>
                <Select value={scope} onValueChange={(v: any) => setScope(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intranet"><Building2 className="h-3.5 w-3.5 inline mr-1.5 text-emerald-600" />Intranet (internal)</SelectItem>
                    <SelectItem value="internet"><Globe className="h-3.5 w-3.5 inline mr-1.5 text-sky-600" />Internet (public)</SelectItem>
                    <SelectItem value="extranet"><Globe2 className="h-3.5 w-3.5 inline mr-1.5 text-violet-600" />Extranet (other commands)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Report category</Label>
                <Select value={reportKind} onValueChange={(v: any) => setReportKind(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REPORT_KIND_LABELS) as InterlinkReportKind[]).map((k) => (
                      <SelectItem key={k} value={k}>{REPORT_KIND_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Weekly attendance summary — week 22" maxLength={255} />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Optional message body…" maxLength={10000} />
            </div>
          </CardContent>
        </Card>

        {/* Approved reports picker */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-fuchsia-600" />
              Approved reports ({reports.length})
            </CardTitle>
            <CardDescription>Pick existing approved reports to attach.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48 border rounded-md">
              <div className="p-2 space-y-1">
                {reports.length === 0 && <p className="text-sm text-muted-foreground italic p-3">No approved reports for this category.</p>}
                {reports.map((r: any) => (
                  <label key={r.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent/40 cursor-pointer">
                    <Checkbox
                      checked={selectedReportIds.has(r.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedReportIds);
                        if (v) next.add(r.id); else next.delete(r.id);
                        setSelectedReportIds(next);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground">{r.category} · {r.report_date} · {r.file_name}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{(r.file_size / 1024).toFixed(0)} KB</Badge>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Generate fresh */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              Generate fresh report from live data
            </CardTitle>
            <CardDescription>Build a new {REPORT_KIND_LABELS[reportKind]} on demand in any format.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => handleGenerateFresh("pdf")} disabled={generating}>
                <FileType className="h-3.5 w-3.5 mr-1.5 text-rose-600" />PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleGenerateFresh("word")} disabled={generating}>
                <FileText className="h-3.5 w-3.5 mr-1.5 text-blue-600" />Word
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleGenerateFresh("excel")} disabled={generating}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleGenerateFresh("csv")} disabled={generating}>
                <FileText className="h-3.5 w-3.5 mr-1.5 text-amber-600" />CSV
              </Button>
              {generating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground self-center" />}
            </div>
            {generatedFiles.length > 0 && (
              <div className="space-y-1">
                {generatedFiles.map((g, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/40 border">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="flex-1 truncate">{g.name}</span>
                    <span className="text-muted-foreground">{(g.size / 1024).toFixed(1)} KB</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setGeneratedFiles(generatedFiles.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Extra uploads */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-cyan-600" /> Extra attachments (optional)
            </CardTitle>
            <CardDescription>Up to {MAX_FILES} files, 5MB each, 15MB total.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input type="file" multiple onChange={(e) => handleAddFiles(e.target.files)} />
            {extraFiles.length > 0 && (
              <div className="space-y-1">
                {extraFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/40 border">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setExtraFiles(extraFiles.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* RIGHT: Recipients + send */}
      <div className="space-y-4">
        <Card className="border-indigo-200 dark:border-indigo-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" /> Recipients
              <Badge variant="outline" className="ml-auto bg-indigo-50 dark:bg-indigo-950">{allRecipientEmails.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Departments */}
            <div>
              <Label className="text-xs flex items-center gap-1.5"><Building2 className="h-3 w-3" />Departments</Label>
              <ScrollArea className="h-32 border rounded mt-1">
                <div className="p-2 space-y-0.5">
                  {departments.length === 0 && <p className="text-xs text-muted-foreground italic p-2">No departments.</p>}
                  {departments.map((d: any) => (
                    <label key={d.id} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-accent/40 cursor-pointer">
                      <Checkbox
                        checked={selectedDeptIds.has(d.id)}
                        disabled={d.emails.length === 0}
                        onCheckedChange={(v) => {
                          const next = new Set(selectedDeptIds);
                          if (v) next.add(d.id); else next.delete(d.id);
                          setSelectedDeptIds(next);
                        }}
                      />
                      <span className="flex-1 truncate">{d.name}</span>
                      <Badge variant="outline" className="text-[9px]">{d.emails.length}</Badge>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Saved lists */}
            <div>
              <Label className="text-xs flex items-center gap-1.5"><Mail className="h-3 w-3" />Saved lists</Label>
              <ScrollArea className="h-24 border rounded mt-1">
                <div className="p-2 space-y-0.5">
                  {lists.length === 0 && <p className="text-xs text-muted-foreground italic p-2">No saved lists yet.</p>}
                  {lists.map((l: any) => (
                    <label key={l.id} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-accent/40 cursor-pointer">
                      <Checkbox
                        checked={selectedListIds.has(l.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(selectedListIds);
                          if (v) next.add(l.id); else next.delete(l.id);
                          setSelectedListIds(next);
                        }}
                      />
                      <span className="flex-1 truncate">{l.name}</span>
                      <Badge variant="outline" className="text-[9px]">{(l.member_emails ?? []).length}</Badge>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Other commands (contacts) */}
            <div>
              <Label className="text-xs flex items-center gap-1.5"><Globe2 className="h-3 w-3" />Other commands</Label>
              <ScrollArea className="h-32 border rounded mt-1">
                <div className="p-2 space-y-0.5">
                  {contacts.length === 0 && <p className="text-xs text-muted-foreground italic p-2">Add commands under Recipients tab.</p>}
                  {contacts.map((c: any) => (
                    <label key={c.id} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-accent/40 cursor-pointer">
                      <Checkbox
                        checked={selectedContactIds.has(c.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(selectedContactIds);
                          if (v) next.add(c.id); else next.delete(c.id);
                          setSelectedContactIds(next);
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{c.display_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{c.command_or_unit ?? c.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Ad-hoc */}
            <div>
              <Label className="text-xs">Ad-hoc emails (comma / newline)</Label>
              <Textarea
                value={adhocEmails}
                onChange={(e) => setAdhocEmails(e.target.value)}
                rows={2}
                className="text-xs"
                placeholder="ops@partner.gov.gh, hq@example.com"
              />
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full bg-green-600 hover:bg-green-700 text-white shadow-md"
          onClick={handleDispatch}
          disabled={sending}
        >
          {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Dispatch to {allRecipientEmails.length} recipient{allRecipientEmails.length === 1 ? "" : "s"}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
          <Lock className="h-3 w-3" /> Server-validated · Per-recipient outcomes logged · Realtime audit trail
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECIPIENTS TAB — manage external command contacts + saved lists

function RecipientsTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [contactDlg, setContactDlg] = useState(false);
  const [listDlg, setListDlg] = useState(false);
  const [newContact, setNewContact] = useState({ display_name: "", command_or_unit: "", email: "", scope: "extranet" as Exclude<InterlinkScope, "mixed">, notes: "" });
  const [newList, setNewList] = useState({ name: "", description: "", scope: "extranet" as Exclude<InterlinkScope, "mixed">, member_emails: "" });

  const { data: contacts = [] } = useQuery({
    queryKey: ["interlink-contacts-mgmt"],
    queryFn: async () => {
      const { data } = await supabase.from("interlink_contacts").select("*").order("display_name");
      return data ?? [];
    },
  });

  const { data: lists = [] } = useQuery({
    queryKey: ["interlink-lists-mgmt"],
    queryFn: async () => {
      const { data } = await supabase.from("interlink_lists").select("*").order("name");
      return data ?? [];
    },
  });

  // ── Test Email
  const [testDlg, setTestDlg] = useState<null | { id: string; name: string; emails: string[] }>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [testSelected, setTestSelected] = useState<Set<string>>(new Set());
  const [testSending, setTestSending] = useState(false);

  function openTestDlg(list: { id: string; name: string; member_emails: string[] }) {
    const emails = (list.member_emails ?? []).filter(Boolean);
    setTestDlg({ id: list.id, name: list.name, emails });
    setTestSelected(new Set(emails.slice(0, 1)));
    setTestRecipient("");
  }

  async function sendTestEmail() {
    if (!testDlg) return;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipients = Array.from(testSelected);
    const adhoc = testRecipient.trim().toLowerCase();
    if (adhoc && emailRe.test(adhoc)) recipients.push(adhoc);
    const dedup = Array.from(new Set(recipients.map((e) => e.toLowerCase())));
    if (dedup.length === 0) return toast.error("Pick at least one recipient or enter an email");
    if (dedup.length > 10) return toast.error("Test sends are capped at 10 recipients");

    setTestSending(true);
    try {
      // Tiny 1x1 transparent PNG so the function's attachment requirement is satisfied
      const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
      const { data, error } = await supabase.functions.invoke("send-record-email", {
        body: {
          recipients: dedup,
          bulk: true,
          subject: `[TEST] Distribution list verification — ${testDlg.name}`,
          message: `This is an automated test message sent from the Interlink System to verify delivery for the distribution list "${testDlg.name}".\n\nIf you received this email, delivery to your address is working.\n\n— GIS Cybernet`,
          attachment_base64: TINY_PNG,
          attachment_filename: "interlink-test.png",
          record_kind: "interlink_test",
        },
      });
      if (error) throw error;
      const sent = (data as any)?.results?.filter?.((r: any) => r.status === "sent" || r.status === "queued").length ?? dedup.length;
      const failed = (data as any)?.results?.filter?.((r: any) => r.status === "failed").length ?? 0;
      toast.success(`Test email — ${sent} delivered${failed ? `, ${failed} failed` : ""}`);
      setTestDlg(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Test send failed");
    } finally {
      setTestSending(false);
    }
  }

  async function saveContact() {
    if (!newContact.display_name || !newContact.email) return toast.error("Name and email required");
    const { error } = await supabase.from("interlink_contacts").insert({ ...newContact, created_by: userId });
    if (error) return toast.error(error.message);
    toast.success("Contact added");
    setContactDlg(false);
    setNewContact({ display_name: "", command_or_unit: "", email: "", scope: "extranet", notes: "" });
    queryClient.invalidateQueries({ queryKey: ["interlink-contacts-mgmt"] });
    queryClient.invalidateQueries({ queryKey: ["interlink-contacts"] });
  }

  async function saveList() {
    if (!newList.name.trim()) return toast.error("List name required");
    // Normalize + validate. Accept comma, semicolon, or newline separators.
    // NOTE: this regex is a single-escaped string-in-source — using \\s/\\. here would
    // require a literal backslash in the email, which is impossible (regression fix).
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const raw = newList.member_emails.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const candidate of raw) {
      const lc = candidate.toLowerCase();
      if (emailRe.test(lc) && !valid.includes(lc)) valid.push(lc);
      else if (!emailRe.test(lc)) invalid.push(candidate);
    }
    if (valid.length === 0) {
      return toast.error(
        invalid.length > 0
          ? `No valid emails (rejected: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""})`
          : "Add at least one valid email",
      );
    }
    const { error } = await supabase.from("interlink_lists").insert({
      name: newList.name.trim(),
      description: newList.description.trim() || null,
      scope: newList.scope,
      member_emails: valid,
      created_by: userId,
    });
    if (error) return toast.error(error.message);
    toast.success(
      invalid.length > 0
        ? `List saved with ${valid.length} emails (skipped ${invalid.length} invalid)`
        : `List saved with ${valid.length} emails`,
    );
    setListDlg(false);
    setNewList({ name: "", description: "", scope: "extranet", member_emails: "" });
    queryClient.invalidateQueries({ queryKey: ["interlink-lists-mgmt"] });
    queryClient.invalidateQueries({ queryKey: ["interlink-lists"] });
  }

  // One-click "seed" lists generated from the existing contact directory grouped by scope.
  async function seedListsFromContacts() {
    if (!contacts.length) return toast.error("No contacts to seed from. Add contacts first.");
    const groups: Record<string, string[]> = { intranet: [], internet: [], extranet: [] };
    for (const c of contacts as any[]) {
      const lc = String(c.email ?? "").trim().toLowerCase();
      if (!lc) continue;
      const scope = (c.scope as string) ?? "extranet";
      if (!groups[scope]) continue;
      if (!groups[scope].includes(lc)) groups[scope].push(lc);
    }
    const today = format(new Date(), "yyyy-MM-dd");
    const rows = (Object.entries(groups) as Array<[Exclude<InterlinkScope, "mixed">, string[]]>)
      .filter(([, emails]) => emails.length > 0)
      .map(([scope, emails]) => ({
        name: `All ${scope} contacts (${today})`,
        description: `Auto-seeded from contact directory on ${today}`,
        scope,
        member_emails: emails,
        created_by: userId,
      }));
    if (rows.length === 0) return toast.error("No contact emails to seed");
    const { error } = await supabase.from("interlink_lists").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Seeded ${rows.length} list${rows.length === 1 ? "" : "s"} from contacts`);
    queryClient.invalidateQueries({ queryKey: ["interlink-lists-mgmt"] });
    queryClient.invalidateQueries({ queryKey: ["interlink-lists"] });
  }

  async function deleteContact(id: string) {
    if (!confirm("Delete this contact?")) return;
    const { error } = await supabase.from("interlink_contacts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    queryClient.invalidateQueries({ queryKey: ["interlink-contacts-mgmt"] });
    queryClient.invalidateQueries({ queryKey: ["interlink-contacts"] });
  }

  async function deleteList(id: string) {
    if (!confirm("Delete this list?")) return;
    const { error } = await supabase.from("interlink_lists").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    queryClient.invalidateQueries({ queryKey: ["interlink-lists-mgmt"] });
    queryClient.invalidateQueries({ queryKey: ["interlink-lists"] });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Globe2 className="h-4 w-4 text-violet-600" />Other Commands & Partners</CardTitle>
            <CardDescription>External recipient directory</CardDescription>
          </div>
          <Dialog open={contactDlg} onOpenChange={setContactDlg}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add command contact</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Display name *</Label><Input value={newContact.display_name} onChange={(e) => setNewContact({ ...newContact, display_name: e.target.value })} /></div>
                <div><Label>Command / Unit</Label><Input value={newContact.command_or_unit} onChange={(e) => setNewContact({ ...newContact, command_or_unit: e.target.value })} placeholder="e.g. GIS HQ Accra" /></div>
                <div><Label>Email *</Label><Input type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} /></div>
                <div>
                  <Label>Scope</Label>
                  <Select value={newContact.scope} onValueChange={(v: any) => setNewContact({ ...newContact, scope: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intranet">Intranet</SelectItem>
                      <SelectItem value="internet">Internet</SelectItem>
                      <SelectItem value="extranet">Extranet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Notes</Label><Textarea value={newContact.notes} onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })} rows={2} /></div>
              </div>
              <DialogFooter><Button onClick={saveContact}>Save contact</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Command</TableHead><TableHead>Email</TableHead><TableHead>Scope</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {contacts.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground italic py-6">No contacts yet</TableCell></TableRow>}
                {contacts.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.display_name}</TableCell>
                    <TableCell>{c.command_or_unit ?? "—"}</TableCell>
                    <TableCell className="text-xs">{c.email}</TableCell>
                    <TableCell><Badge variant="outline" className={SCOPE_META[c.scope as keyof typeof SCOPE_META]?.tone}>{c.scope}</Badge></TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => deleteContact(c.id)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4 text-fuchsia-600" />Saved Distribution Lists</CardTitle>
            <CardDescription>Reusable recipient groups</CardDescription>
          </div>
          <Dialog open={listDlg} onOpenChange={setListDlg}>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={seedListsFromContacts}
                disabled={contacts.length === 0}
                className="gap-1"
                title="Generate one distribution list per scope from the contact directory"
              >
                <Sparkles className="h-4 w-4" />
                Seed from contacts
              </Button>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New list</Button></DialogTrigger>
            </div>
            <DialogContent>
              <DialogHeader><DialogTitle>Create distribution list</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={newList.name} onChange={(e) => setNewList({ ...newList, name: e.target.value })} /></div>
                <div><Label>Description</Label><Input value={newList.description} onChange={(e) => setNewList({ ...newList, description: e.target.value })} /></div>
                <div>
                  <Label>Scope</Label>
                  <Select value={newList.scope} onValueChange={(v: any) => setNewList({ ...newList, scope: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intranet">Intranet</SelectItem>
                      <SelectItem value="internet">Internet</SelectItem>
                      <SelectItem value="extranet">Extranet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Member emails *</Label><Textarea value={newList.member_emails} onChange={(e) => setNewList({ ...newList, member_emails: e.target.value })} rows={5} placeholder="one@example.com, two@example.com" /></div>
              </div>
              <DialogFooter><Button onClick={saveList}>Save list</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Scope</TableHead><TableHead>Members</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {lists.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground italic py-6">No lists yet</TableCell></TableRow>}
                {lists.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell><div className="font-medium">{l.name}</div>{l.description && <div className="text-[11px] text-muted-foreground">{l.description}</div>}</TableCell>
                    <TableCell><Badge variant="outline" className={SCOPE_META[l.scope as keyof typeof SCOPE_META]?.tone}>{l.scope}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{(l.member_emails ?? []).length}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openTestDlg(l)}
                        disabled={(l.member_emails ?? []).length === 0}
                        className="h-7 gap-1 text-xs"
                        title="Send a test email to verify delivery"
                      >
                        <MailCheck className="h-3.5 w-3.5 text-emerald-600" /> Test
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteList(l.id)} className="h-7 w-7">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* List audit trail */}
      <div className="lg:col-span-2">
        <InterlinkListAuditPanel />
      </div>

      {/* Test email dialog */}
      <Dialog open={!!testDlg} onOpenChange={(v) => !v && setTestDlg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailCheck className="h-5 w-5 text-emerald-600" />
              Send test email — {testDlg?.name}
            </DialogTitle>
            <DialogDescription>
              Pick which addresses to test. A small placeholder attachment is sent so you can verify provider delivery
              without disturbing the full list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Recipients in this list</Label>
              <ScrollArea className="h-[180px] rounded border p-2 mt-1">
                <div className="space-y-1.5">
                  {(testDlg?.emails ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground italic">List has no members.</p>
                  )}
                  {(testDlg?.emails ?? []).map((e) => (
                    <label key={e} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 px-1.5 py-1 rounded">
                      <Checkbox
                        checked={testSelected.has(e)}
                        onCheckedChange={(v) => {
                          const next = new Set(testSelected);
                          if (v) next.add(e); else next.delete(e);
                          setTestSelected(next);
                        }}
                      />
                      <span className="font-mono">{e}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-[10px] text-muted-foreground mt-1">
                {testSelected.size} of {testDlg?.emails.length ?? 0} selected · max 10 per test
              </p>
            </div>
            <div>
              <Label className="text-xs">Or send to a one-off address</Label>
              <Input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="verify@example.com"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDlg(null)} disabled={testSending}>Cancel</Button>
            <Button onClick={sendTestEmail} disabled={testSending} className="gap-1.5">
              {testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// List audit panel — who created / updated / deleted distribution lists
function InterlinkListAuditPanel() {
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["interlink-lists-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_lists_audit" as any)
        .select("id, list_id, list_name, action, actor_name, diff, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  function fmtVal(v: any): string {
    if (v === null || v === undefined) return "∅";
    if (Array.isArray(v)) return `[${v.length}] ${v.slice(0, 3).join(", ")}${v.length > 3 ? "…" : ""}`;
    return String(v);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-amber-600" /> Distribution List Audit Trail
          </CardTitle>
          <CardDescription>Who created, updated, or deleted lists — with diffs</CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] rounded border">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">When</TableHead>
                  <TableHead className="text-xs">By</TableHead>
                  <TableHead className="text-xs">List</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs">Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground italic">No list changes recorded yet.</TableCell></TableRow>
                )}
                {rows.map((r) => {
                  const entries = r.diff ? Object.entries(r.diff as Record<string, { from: any; to: any }>) : [];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell className="text-xs">{r.actor_name ?? "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{r.list_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.action === "create" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : r.action === "delete" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          }
                        >
                          {r.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {entries.length === 0 ? <span className="text-muted-foreground">—</span> : (
                          <div className="space-y-0.5">
                            {entries.map(([k, v]) => (
                              <div key={k} className="leading-tight">
                                <span className="font-medium">{k}:</span>{" "}
                                <span className="text-muted-foreground line-through">{fmtVal(v.from)}</span>
                                <span className="mx-1 text-muted-foreground">→</span>
                                <span className="text-emerald-700 dark:text-emerald-400 font-medium">{fmtVal(v.to)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT TAB — realtime dispatch log with export

function AuditTab() {
  const queryClient = useQueryClient();
  const { canExportInterlinkLogs } = useAuth();
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ["interlink-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_dispatches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("interlink-audit-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "interlink_dispatches" }, () => {
        queryClient.invalidateQueries({ queryKey: ["interlink-audit"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const filtered = dispatches.filter((d: any) => {
    if (scopeFilter !== "all" && d.scope !== scopeFilter) return false;
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = [d.subject, d.report_kind, ...(d.recipient_emails ?? []), ...(d.attachment_names ?? [])].join(" ").toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  function exportAudit(fmt: "csv" | "excel" | "pdf" | "json") {
    const rows = filtered.map((d: any) => ({
      created_at: d.created_at,
      subject: d.subject,
      scope: d.scope,
      report_kind: d.report_kind,
      source: d.source,
      workflow_state: d.workflow_state,
      status: d.status,
      recipient_count: d.recipient_count,
      attachment_count: d.attachment_count,
      total_attachment_bytes: d.total_attachment_bytes,
      sent_count: d.sent_count,
      failed_count: d.failed_count,
    }));
    if (fmt === "csv") exportDispatchesCSV(rows);
    else if (fmt === "excel") exportDispatchesXLSX(rows);
    else if (fmt === "json") exportDispatchesJSON(rows);
    else exportDispatchesPDF(rows);
    toast.success(`Exported ${rows.length} record${rows.length === 1 ? "" : "s"}`);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base flex items-center gap-2 mr-auto">
            <ScrollText className="h-4 w-4 text-amber-600" />
            Dispatch Audit Trail
            <Badge variant="outline" className="ml-2">{filtered.length}</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["interlink-audit"] })}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
          </Button>
          {canExportInterlinkLogs ? (
            <>
              <Button size="sm" variant="outline" onClick={() => exportAudit("csv")}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
              <Button size="sm" variant="outline" onClick={() => exportAudit("excel")}><Download className="h-3.5 w-3.5 mr-1" />Excel</Button>
              <Button size="sm" variant="outline" onClick={() => exportAudit("pdf")}><Download className="h-3.5 w-3.5 mr-1" />PDF</Button>
              <Button size="sm" variant="outline" onClick={() => exportAudit("json")}><Download className="h-3.5 w-3.5 mr-1" />JSON</Button>
            </>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground self-center" title="Exporting dispatch logs is restricted to Admin and OIC.">
              Export: Admin/OIC only
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Input placeholder="Search subject, recipient, file…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Scope" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="intranet">Intranet</SelectItem>
              <SelectItem value="internet">Internet</SelectItem>
              <SelectItem value="extranet">Extranet</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead><TableHead>Subject</TableHead><TableHead>Scope</TableHead>
                <TableHead>Report</TableHead><TableHead>Recipients</TableHead><TableHead>Files</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground italic py-8">No dispatches</TableCell></TableRow>}
              {filtered.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(d.created_at), "dd MMM HH:mm")}</TableCell>
                  <TableCell className="max-w-xs truncate font-medium">{d.subject}</TableCell>
                  <TableCell><Badge variant="outline" className={SCOPE_META[d.scope as keyof typeof SCOPE_META]?.tone ?? ""}>{d.scope}</Badge></TableCell>
                  <TableCell className="text-xs">{d.report_kind ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{d.recipient_count}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{d.attachment_count}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      d.status === "sent" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : d.status === "failed" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                      : d.status === "partial" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300"
                    }>
                      {d.status} {d.status !== "pending" && `(${d.sent_count}/${d.recipient_count})`}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS TAB — realtime stats & summaries

function AnalyticsTab() {
  const queryClient = useQueryClient();
  const { data: stats } = useQuery({
    queryKey: ["interlink-analytics"],
    queryFn: async () => {
      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("interlink_dispatches")
        .select("scope, status, recipient_count, attachment_count, total_attachment_bytes, created_at")
        .gte("created_at", since30);
      const all = data ?? [];
      const totals = {
        dispatches: all.length,
        recipients: all.reduce((s, x) => s + (x.recipient_count ?? 0), 0),
        files: all.reduce((s, x) => s + (x.attachment_count ?? 0), 0),
        bytes: all.reduce((s, x) => s + (x.total_attachment_bytes ?? 0), 0),
        sent: all.filter((x) => x.status === "sent").length,
        partial: all.filter((x) => x.status === "partial").length,
        failed: all.filter((x) => x.status === "failed").length,
      };
      const byScope: Record<string, number> = { intranet: 0, internet: 0, extranet: 0 };
      all.forEach((x) => { byScope[x.scope] = (byScope[x.scope] ?? 0) + 1; });
      return { totals, byScope };
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("interlink-analytics-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "interlink_dispatches" }, () => {
        queryClient.invalidateQueries({ queryKey: ["interlink-analytics"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const t = stats?.totals;
  const s = stats?.byScope;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Dispatches (30d)" value={t?.dispatches ?? 0} tone="from-indigo-500 to-blue-500" icon={Send} />
        <StatCard label="Recipients reached" value={t?.recipients ?? 0} tone="from-emerald-500 to-teal-500" icon={Users} />
        <StatCard label="Files delivered" value={t?.files ?? 0} tone="from-violet-500 to-fuchsia-500" icon={FileText} />
        <StatCard label="Total bytes" value={`${((t?.bytes ?? 0) / (1024 * 1024)).toFixed(1)} MB`} tone="from-amber-500 to-rose-500" icon={Download} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Outcome breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Row label="✅ Sent (all delivered)" value={t?.sent ?? 0} tone="bg-emerald-500" max={t?.dispatches ?? 1} />
            <Row label="⚠️ Partial" value={t?.partial ?? 0} tone="bg-amber-500" max={t?.dispatches ?? 1} />
            <Row label="❌ Failed" value={t?.failed ?? 0} tone="bg-rose-500" max={t?.dispatches ?? 1} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By scope</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Row label="🏢 Intranet" value={s?.intranet ?? 0} tone="bg-emerald-500" max={t?.dispatches ?? 1} />
            <Row label="🌐 Internet" value={s?.internet ?? 0} tone="bg-sky-500" max={t?.dispatches ?? 1} />
            <Row label="🤝 Extranet" value={s?.extranet ?? 0} tone="bg-violet-500" max={t?.dispatches ?? 1} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon }: { label: string; value: any; tone: string; icon: any }) {
  return (
    <Card className={`border-0 text-white bg-gradient-to-br ${tone} shadow-md`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <Icon className="h-5 w-5 opacity-80" />
          <div className="text-2xl font-bold">{value}</div>
        </div>
        <p className="text-xs mt-2 opacity-90">{label}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone, max }: { label: string; value: number; tone: string; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="font-bold">{value} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// File generation helpers (mirrors export-utils but returns Blob instead of download)

async function buildReportBlob(
  fmt: ExportFormat,
  opts: { title: string; headers: string[]; rows: string[][]; filename: string }
): Promise<Blob> {
  if (fmt === "csv") {
    const escape = (c: string) => csvCellQuoted((c ?? ""));
    const lines = [escape("Cybernet HRM System"), escape(opts.title), ""];
    lines.push(opts.headers.map(escape).join(","));
    opts.rows.forEach((r) => lines.push(r.map(escape).join(",")));
    return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  }
  if (fmt === "excel") {
    const XLSX = await import("xlsx");
    const aoa = [["Cybernet HRM System"], [opts.title], [], opts.headers, ...opts.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, opts.title.slice(0, 31) || "Report");
    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  if (fmt === "word") {
    const tableRows = opts.rows
      .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #ccc;padding:4px 8px;font-size:10pt">${c ?? ""}</td>`).join("")}</tr>`)
      .join("");
    const headerRow = `<tr>${opts.headers.map((h) => `<th style="border:1px solid #006699;padding:4px 8px;background:#006699;color:#fff">${h}</th>`).join("")}</tr>`;
    const html = `<html><head><meta charset="utf-8"></head><body>
      <h2 style="color:#006699">Cybernet HRM System</h2><h3>${opts.title}</h3>
      <table style="border-collapse:collapse">${headerRow}${tableRows}</table>
    </body></html>`;
    return new Blob([html], { type: "application/msword" });
  }
  // pdf
  const jsPDF = (await import("jspdf")).default;
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: opts.headers.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14); doc.text("Cybernet HRM System", 14, 15);
  doc.setFontSize(11); doc.text(opts.title, 14, 23);
  autoTable(doc, {
    head: [opts.headers], body: opts.rows, startY: 28,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [0, 102, 153], textColor: 255 },
  });
  return doc.output("blob");
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
