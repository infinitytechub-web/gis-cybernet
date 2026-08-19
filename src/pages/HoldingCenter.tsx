import { useState, useEffect, useMemo } from "react";
import { assertGhanaPhoneList, assertContactPhoneList } from "@/lib/ghana-phone";
import { ContactPhoneInput } from "@/components/ui/contact-phone-input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { openPrintWindow } from "@/lib/safe-print";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardBailTab } from "@/components/detention/StandardBailTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ExportMenu } from "@/components/ui/export-menu";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { MultiContactInput } from "@/components/ui/multi-contact-input";
import { ShieldAlert, Lock, Plus, Search, Camera, AlertTriangle, UserCheck, Package, Heart, ArrowRightLeft, Users, Activity, BarChart3, FileSearch, X, Stethoscope, Eye, Pencil, Printer, Trash2, Gavel, Check, Ban } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StatementApproverPicker } from "@/components/detention/StatementApproverPicker";
import { StaffPicker } from "@/components/detention/StaffPicker";
import { ReferralSelect } from "@/components/detention/ReferralSelect";
import {
  GENDER_OPTIONS, OTHER_AGENCY, REFERRAL_SOURCES, REFERRAL_DESTINATIONS, referralDisplay,
  OFFENSE_GROUPS, offenseCategory,
} from "@/components/detention/detention-options";
import { DuplicateCheckDialog } from "@/components/detention/DuplicateCheckDialog";
import { checkDetaineeDuplicates, type DuplicateMatch } from "@/lib/detention-duplicates";
import { softDelete } from "@/lib/recycle-bin";
import { AgeDisplay } from "@/components/ui/age-display";
import { formatDate, formatDateTime, ageLabel, ageGroup, DATE_FORMAT_HINT } from "@/lib/date-format";
import { canSeeField, displayField, type FieldContext, type SensitiveField } from "@/lib/field-visibility";
import { Sensitive } from "@/components/Sensitive";


import { toast } from "sonner";
import { format, formatDistanceToNow, differenceInHours, differenceInDays, subDays, subMonths, startOfDay } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area } from "recharts";
import { SelectGroup, SelectLabel } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { StatusWorkflowControl, StatusHistoryList } from "@/components/shared/StatusWorkflowControl";
import { statusLabelFor, statusMeta, statusOptions } from "@/lib/status-workflows";


const PIE_COLORS = ["hsl(var(--primary))", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];
/**
 * Custody status colours + labels come from the shared workflow registry
 * (src/lib/status-workflows.ts), so the table, detail sheet, analytics,
 * reports and exports always agree. Legacy rows stored `deported`; both that
 * and `repatriated` render as "Repatriated".
 */
const STATUS_COLORS: Record<string, string> = Object.fromEntries(
  statusOptions("detention_records")
    .concat([{ value: "deported", label: "Repatriated", badgeClass: statusMeta("detention_records", "deported").badgeClass, dotClass: "" }])
    .map((o) => [o.value, o.badgeClass]),
);
const statusLabel = (s?: string | null) => statusLabelFor("detention_records", s);
const ARCHIVE_REVIEW_LABELS: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved",
  denied: "Denied",
};
const ARCHIVE_REVIEW_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  denied: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200",
};
const ARCHIVE_STATUSES = ["released", "bail", "repatriated", "deported", "transferred", "court", "escaped"];
const RELEASE_OUTCOMES = statusOptions("detention_records")
  .filter((o) => o.value !== "in_custody")
  .map((o) => ({ value: o.value, label: o.value === "bail" ? "Bail Granted" : o.value === "court" ? "Sent to Court" : o.label }));
/** Referral option lists live in detention-options.ts (shared with the bail form). */

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-200 text-red-900",
};

export default function HoldingCenter() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("active");
  const [selected, setSelected] = useState<any>(null);
  const allowed = ["admin", "oic", "2ic", "supervisor", "shift_supervisor", "deputy_shift_supervisor"].includes(role || "");
  const canCreate = allowed;

  useEffect(() => {
    const ch = supabase.channel("holding-realtime");
    ["detention_records", "detention_property_log", "detention_visitor_log", "detention_medical_log", "detention_transfers"].forEach(t =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        qc.invalidateQueries({ queryKey: ["detention_records"] });
        qc.invalidateQueries({ queryKey: ["holding-analytics"] });
        if (selected) qc.invalidateQueries({ queryKey: ["detention-detail", selected.id] });
      })
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, selected]);

  if (!allowed) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-12 text-center">
          <Lock className="h-12 w-12 mx-auto text-destructive mb-3" />
          <p className="font-semibold">Access Restricted</p>
          <p className="text-sm text-muted-foreground">This module is reserved for command and enforcement supervisors.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-rose-600" />
          <div>
            <h1 className="text-2xl font-bold text-secondary">Holding / Detention Center</h1>
            <p className="text-sm text-muted-foreground">Custody management — restricted access · all activity audited</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/50 p-1">
          <TabsTrigger value="active" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white"><UserCheck className="h-4 w-4 mr-1 text-rose-700 dark:text-rose-400" />Active Custody</TabsTrigger>
          <TabsTrigger value="archive" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white"><FileSearch className="h-4 w-4 mr-1 text-slate-700 dark:text-slate-300" />Archive</TabsTrigger>
          <TabsTrigger value="bail" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white"><Gavel className="h-4 w-4 mr-1 text-cyan-700 dark:text-cyan-400" />Bail</TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><BarChart3 className="h-4 w-4 mr-1 text-blue-700 dark:text-blue-400" />Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="active"><RecordsList status={["in_custody"]} canCreate={canCreate} userId={user?.id} role={role} onSelect={setSelected} /></TabsContent>
        <TabsContent value="archive"><RecordsList status={ARCHIVE_STATUSES} canCreate={false} isArchive userId={user?.id} role={role} onSelect={setSelected} /></TabsContent>
        <TabsContent value="bail"><StandardBailTab canEdit={canCreate} canDelete={["admin", "oic", "2ic"].includes(role || "")} canAuthorize={["admin", "oic", "2ic", "staff_officer", "supervisor"].includes(role || "")} /></TabsContent>
        <TabsContent value="analytics"><HoldingAnalytics /></TabsContent>
      </Tabs>

      {selected && <DetainDetailDrawer record={selected} onClose={() => setSelected(null)} userId={user?.id} role={role} />}
    </div>
  );
}

/* ----------------- LIST ----------------- */
function RecordsList({ status, canCreate, isArchive = false, userId, role, onSelect }: { status: string[]; canCreate: boolean; isArchive?: boolean; userId?: string; role: string | null; onSelect: (r: any) => void }) {
  /** Only command tier may change a custody status. */
  const canCommand = ["admin", "oic", "2ic"].includes(role || "");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterGender, setFilterGender] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [filterCountry, setFilterCountry] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [deletePending, setDeletePending] = useState(false);

  const isAdmin = role === "admin";
  const isOic = role === "oic";
  const canModify = isAdmin || isOic;
  /**
   * Archive review authority — Admin, OIC and 2IC only. The same rule is
   * enforced server-side by the `guard_detention_archive_review` trigger, so
   * hiding the buttons is convenience, not the security boundary.
   */
  const canReviewArchive = ["admin", "oic", "2ic"].includes(role || "");
  const [review, setReview] = useState<{ record: any; action: "approved" | "denied" } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewPending, setReviewPending] = useState(false);

  const submitReview = async () => {
    if (!review) return;
    if (review.action === "denied" && !reviewReason.trim()) {
      toast.error("A reason is required to deny an archived record");
      return;
    }
    setReviewPending(true);
    try {
      const { error } = await supabase
        .from("detention_records")
        .update({
          archive_review_status: review.action,
          archive_review_reason: reviewReason.trim() || null,
        } as any)
        .eq("id", review.record.id);
      if (error) throw error;
      toast.success(review.action === "approved" ? "Archived record approved" : "Archived record denied");
      qc.invalidateQueries({ queryKey: ["detention_records"] });
      setReview(null);
      setReviewReason("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to record the review");
    } finally {
      setReviewPending(false);
    }
  };

  const { data: records = [] } = useQuery({
    queryKey: ["detention_records", status],
    queryFn: async () => (await supabase.from("detention_records").select("*").in("status", status).order("intake_at", { ascending: false })).data || [],
  });

  const filtered = useMemo(() => records.filter((r: any) => {
    const q = search.toLowerCase();
    if (q && !`${r.first_name} ${r.last_name} ${r.alias || ""} ${r.nationality || ""} ${r.crime_type} ${r.referred_from || ""} ${r.referred_to || ""} ${r.next_of_kin || ""} ${r.statement_approved_by_name || ""} ${statusLabel(r.status)}`.toLowerCase().includes(q)) return false;
    if (filterGender !== "all" && r.gender !== filterGender) return false;
    if (filterRisk !== "all" && r.risk_level !== filterRisk) return false;
    if (filterCountry && (r.nationality || "").toLowerCase() !== filterCountry.toLowerCase() && (r.country_of_origin || "").toLowerCase() !== filterCountry.toLowerCase()) return false;
    return true;
  }), [records, search, filterGender, filterRisk, filterCountry]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await softDelete({
        table: "detention_records",
        id: deleting.id,
        label: `Detainee: ${deleting.first_name} ${deleting.last_name}`,
        context: `${deleting.crime_type}${deleting.cell_number ? ` · Cell ${deleting.cell_number}` : ""} · Intake ${formatDate(deleting.intake_at)}`,
      });
      toast.success("Record moved to Recycle Bin");
      qc.invalidateQueries({ queryKey: ["detention_records"] });
      setDeleting(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, alias, nationality, crime…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={filterGender} onValueChange={setFilterGender}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All genders</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
        </Select>
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All risk</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
        </Select>
        <div className="w-[200px]">
          <CountryCombobox value={filterCountry} onValueChange={setFilterCountry} placeholder="All countries" />
        </div>
        {filterCountry && (
          <Button variant="ghost" size="sm" onClick={() => setFilterCountry("")} className="gap-1">
            <X className="h-3 w-3" /> Clear country
          </Button>
        )}
        <ExportMenu getData={() => ({
          title: "Detention Records",
          filename: `detention-${format(new Date(), "yyyy-MM-dd")}`,
          headers: ["Name", "Gender", "Nationality", "Type of Offense", "Cell", "Intake", "Status", "Risk", "Referred From", "Referred To", "Next of Kin (NoK)", "Next of Kin (NoK) Phone", "Statement Approved by", ...(isArchive ? ["Archive Review", "Reviewed At", "Review Reason"] : [])],
          rows: filtered.map((r: any) => [`${r.first_name} ${r.last_name}`, r.gender || "-", r.nationality || "-", r.crime_type, r.cell_number || "-", formatDateTime(r.intake_at), statusLabel(r.status), r.risk_level, referralDisplay(r.referred_from, r.referred_from_other) || "-", referralDisplay(r.referred_to, r.referred_to_other) || "-", displayField("next_of_kin", r.next_of_kin, { role: role as any }), displayField("next_of_kin", r.next_of_kin_phone, { role: role as any }), r.statement_approved_by_name || "-", ...(isArchive ? [ARCHIVE_REVIEW_LABELS[r.archive_review_status || "pending"], r.archive_reviewed_at ? formatDateTime(r.archive_reviewed_at) : "-", r.archive_review_reason || "-"] : [])]),
        })} />
        {canCreate && <Button onClick={() => setIntakeOpen(true)} className="ml-auto gap-1 bg-rose-600 hover:bg-rose-700"><Plus className="h-4 w-4" />New Intake</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1000px]">
              <TableHeader><TableRow>
                <TableHead></TableHead><TableHead>Detainee</TableHead><TableHead>Gender</TableHead>
                <TableHead>Nationality</TableHead><TableHead>Type of Offense</TableHead><TableHead>Cell</TableHead>
                <TableHead>Risk</TableHead><TableHead>Status</TableHead><TableHead>Duration</TableHead>
                {isArchive && <TableHead>Archive Review</TableHead>}
                <TableHead className="text-center">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? <TableRow><TableCell colSpan={isArchive ? 11 : 10} className="text-center py-6 text-muted-foreground">No records</TableCell></TableRow>
                : filtered.map((r: any) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-accent/50" onClick={() => onSelect(r)}>
                    <TableCell><Avatar className="h-9 w-9"><AvatarFallback className="bg-rose-100 text-rose-700 text-xs">{r.first_name[0]}{r.last_name[0]}</AvatarFallback></Avatar></TableCell>
                    <TableCell><div className="font-medium">{r.first_name} {r.last_name}</div>{r.alias && <div className="text-xs text-muted-foreground">aka "{r.alias}"</div>}</TableCell>
                    <TableCell className="capitalize">{r.gender || "—"}</TableCell>
                    <TableCell>{r.nationality || "—"}</TableCell>
                    <TableCell>{r.crime_type}</TableCell>
                    <TableCell className="font-mono">{r.cell_number || "—"}</TableCell>
                    <TableCell><Badge className={RISK_COLORS[r.risk_level]}>{r.risk_level}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <StatusWorkflowControl
                        entity="detention_records"
                        recordId={r.id}
                        status={r.status}
                        canChange={canCommand}
                        compact
                        invalidateKeys={[["detention_records"], ["detention-detail", r.id]]}
                      />
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDistanceToNow(new Date(r.intake_at), { addSuffix: false })}</TableCell>
                    {isArchive && (
                      <TableCell className="whitespace-nowrap">
                        <Badge className={ARCHIVE_REVIEW_COLORS[r.archive_review_status || "pending"]}>
                          {ARCHIVE_REVIEW_LABELS[r.archive_review_status || "pending"]}
                        </Badge>
                        {r.archive_reviewed_at && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {formatDateTime(r.archive_reviewed_at)}
                          </div>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSelect(r)} title="View details">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canModify && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(r)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isArchive && canReviewArchive && (
                          <>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-500/10 dark:text-emerald-400"
                              disabled={(r.archive_review_status || "pending") === "approved"}
                              onClick={() => { setReviewReason(""); setReview({ record: r, action: "approved" }); }}
                              title="Approve archived record"
                              aria-label={`Approve archived record for ${r.first_name} ${r.last_name}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={(r.archive_review_status || "pending") === "denied"}
                              onClick={() => { setReviewReason(""); setReview({ record: r, action: "denied" }); }}
                              title="Deny archived record"
                              aria-label={`Deny archived record for ${r.first_name} ${r.last_name}`}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => printDetentionRecord(r, { role: role as any })} title="Print">
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        {canModify && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleting(r)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {intakeOpen && <IntakeForm onClose={() => setIntakeOpen(false)} userId={userId} role={role} />}
      {editing && <EditDetaineeDialog record={editing} onClose={() => setEditing(null)} role={role} />}

      <AlertDialog open={!!review} onOpenChange={(o) => { if (!o) { setReview(null); setReviewReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {review?.action === "approved" ? "Approve this archived record?" : "Deny this archived record?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {review && (
                <>
                  {review.action === "approved" ? "Approving" : "Denying"} the archived record for{" "}
                  <span className="font-semibold">{review.record.first_name} {review.record.last_name}</span>{" "}
                  ({statusLabel(review.record.status)} · intake {formatDate(review.record.intake_at)}).
                  The decision, reviewer and time are recorded.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="archive-review-reason">
              {review?.action === "denied" ? "Reason for denial (required)" : "Remarks (optional)"}
            </Label>
            <Textarea
              id="archive-review-reason"
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              placeholder={review?.action === "denied" ? "Explain why this archived record is denied…" : "Any supporting remarks…"}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reviewPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); submitReview(); }}
              disabled={reviewPending || (review?.action === "denied" && !reviewReason.trim())}
              className={review?.action === "denied" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {reviewPending ? "Saving…" : review?.action === "denied" ? "Confirm Deny" : "Confirm Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this detention record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && <>The record for <span className="font-semibold">{deleting.first_name} {deleting.last_name}</span> will be moved to the Recycle Bin and can be restored within 30 days by Admin or Command OIC.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deletePending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletePending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ----------------- PRINT HELPER ----------------- */
function printDetentionRecord(r: any, viewer: FieldContext = { role: null }) {
  const esc = (s: any) => String(s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const isDark = document.documentElement.classList.contains("dark");
  const bg = isDark ? "#1e293b" : "#fff";
  const fg = isDark ? "#e2e8f0" : "#1e293b";
  const border = isDark ? "#334155" : "#e2e8f0";
  // Confidentiality: identity, contact and next-of-kin values are redacted on
  // the printout unless the printing officer has a need-to-know for them.
  const f = (field: SensitiveField, value: any) => displayField(field, value, viewer);
  const rows: [string, any][] = [
    ["Full Name", `${r.first_name} ${r.last_name}`],
    ["Alias", r.alias],
    ["Gender", r.gender],
    ["Date of Birth", canSeeField("detainee_identity", viewer) ? formatDate(r.date_of_birth) : "••/••/••••"],
    ["Age", ageLabel(r.date_of_birth)],
    ["Nationality", r.nationality],
    ["Country of Origin", r.country_of_origin],
    ["ID Type", r.id_type],
    ["ID Number", f("detainee_identity", r.id_number)],
    ["Phone", f("detainee_contact", r.phone)],
    ["Home Address", f("detainee_contact", r.home_address)],
    ["Type of Offense", r.crime_type],
    ["Charge Description", r.charge_description],
    ["Location of Arrest", r.location_of_arrest],
    ["Arresting Officer", r.arresting_officer_name],
    ["Cell / Room", r.cell_number],
    ["Risk Level", r.risk_level],
    ["Status", statusLabel(r.status)],
    ["Intake", formatDateTime(r.intake_at)],
    ["Custody Duration", `${differenceInHours(r.released_at ? new Date(r.released_at) : new Date(), new Date(r.intake_at))} hrs`],
    ["Referred from", referralDisplay(r.referred_from, r.referred_from_other)],
    ["Referred to", referralDisplay(r.referred_to, r.referred_to_other)],
    ["Statement Approved by", r.statement_approved_by_name],
    ["Next of Kin (NoK)", f("next_of_kin", r.next_of_kin)],
    ["Next of Kin (NoK) Phone", f("next_of_kin", r.next_of_kin_phone)],
    ["Emergency Contact", f("detainee_contact", r.emergency_contact)],
    ["Medical Alerts", f("medical_record", r.medical_alerts)],
    ["Notes", r.notes],
  ];

  const html = `<!DOCTYPE html><html><head><title>Detention Record — ${esc(r.first_name)} ${esc(r.last_name)}</title>
<style>
  @media print { @page { size: portrait; margin: 14mm; } }
  body { font-family: system-ui, sans-serif; color: ${fg}; background: ${bg}; margin: 0; padding: 18px; }
  h2 { font-size: 16px; margin: 0 0 2px; color: #be123c; }
  h3 { font-size: 13px; margin: 0 0 10px; color: ${fg}; }
  .meta { font-size: 10px; color: #888; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 10px; border: 1px solid ${border}; font-size: 11px; vertical-align: top; }
  td.label { background: ${isDark ? "#334155" : "#f1f5f9"}; font-weight: 600; width: 35%; }
  .footer { text-align: center; margin-top: 18px; font-size: 9px; color: #888; }
</style></head><body>
  <h2>Cybernet HRM System</h2>
  <h3>Holding / Detention Center — Detainee Record</h3>
  <div class="meta">Generated: ${formatDateTime(new Date())}</div>
  <table><tbody>
    ${rows.map(([label, value]) => `<tr><td class="label">${esc(label)}</td><td>${esc(value)}</td></tr>`).join("")}
  </tbody></table>
  <div class="footer">CONFIDENTIAL — Ghana Immigration Service</div>
</body></html>`;
  openPrintWindow(html, { features: "noopener,noreferrer,width=900,height=700", autoPrint: true, printDelayMs: 500 });
}

/* ----------------- SHARED VALIDATION ----------------- */
/**
 * Conditional-field validation shared by intake and edit: when
 * "Other Agency or Command" is chosen the specific agency/command name is
 * mandatory before the record can be saved.
 */
function validateDetaineeForm(form: any) {
  if (!form.first_name?.trim() || !form.last_name?.trim()) return "First and last name are required";
  if (!form.crime_type) return "Type of offense is required";
  if (!form.risk_level) return "Risk level is required";
  if (!form.gender) return "Gender is required";
  if (form.referred_from === OTHER_AGENCY && !form.referred_from_other?.trim())
    return "Specify the agency/command for “Referred from”";
  if (form.referred_to === OTHER_AGENCY && !form.referred_to_other?.trim())
    return "Specify the agency/command for “Referred to”";
  if (form.date_of_birth && new Date(form.date_of_birth) > new Date()) return "Date of birth cannot be in the future";
  return null;
}

/* ----------------- EDIT DIALOG ----------------- */
function EditDetaineeDialog({ record, onClose, role }: { record: any; onClose: () => void; role?: string | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    first_name: record.first_name || "",
    last_name: record.last_name || "",
    alias: record.alias || "",
    gender: record.gender || "male",
    date_of_birth: record.date_of_birth || "",
    marital_status: record.marital_status || "",
    nationality: record.nationality || "",
    country_of_origin: record.country_of_origin || "",
    id_type: record.id_type || "Passport",
    id_number: record.id_number || "",
    phone: record.phone || "",
    home_address: record.home_address || "",
    next_of_kin: record.next_of_kin || "",
    next_of_kin_phone: record.next_of_kin_phone || "",
    emergency_contact: record.emergency_contact || "",
    crime_type: record.crime_type || "Illegal Entry",
    charge_description: record.charge_description || "",
    location_of_arrest: record.location_of_arrest || "",
    arresting_officer_name: record.arresting_officer_name || "",
    cell_number: record.cell_number || "",
    risk_level: record.risk_level || "medium",
    medical_alerts: record.medical_alerts || "",
    notes: record.notes || "",
    referred_from: record.referred_from || "",
    referred_to: record.referred_to || "",
    referred_from_other: record.referred_from_other || "",
    referred_to_other: record.referred_to_other || "",
  });
  const canApprove = ["admin", "oic", "2ic"].includes(role || "");
  const [approver, setApprover] = useState<{ id: string | null; label: string | null }>({
    id: record.statement_approved_by || null,
    label: record.statement_approved_by_name || null,
  });

  const update = useMutation({
    mutationFn: async () => {
      const problem = validateDetaineeForm(form);
      if (problem) throw new Error(problem);
      const phones = {
        phone: assertContactPhoneList(form.phone, "Phone"),
        next_of_kin_phone: assertContactPhoneList(form.next_of_kin_phone, "Next of Kin (NoK) Phone"),
      };
      const payload: any = { ...form, ...phones };
      if (canApprove) {
        payload.statement_approved_by = approver.id;
        payload.statement_approved_by_name = approver.label;
        if (!approver.id) payload.statement_approved_at = null;
      }
      const { error } = await supabase.from("detention_records").update(payload).eq("id", record.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention_records"] }); toast.success("Record updated"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-rose-600" />Edit Detainee Record</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="border rounded-lg p-3 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4" />Biodata</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><Label>First Name *</Label><Input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} /></div>
              <div><Label>Last Name *</Label><Input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} /></div>
              <div><Label>Alias</Label><Input value={form.alias} onChange={e => setForm(p => ({ ...p, alias: e.target.value }))} /></div>
              <div><Label>Gender *</Label>
                <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>{GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><div className="flex items-center justify-between gap-2 mb-1"><Label>Date of Birth ({DATE_FORMAT_HINT})</Label><AgeDisplay dob={form.date_of_birth} /></div><DateInput  value={form.date_of_birth} onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))} /></div>
              <div><Label>Marital Status</Label>
                <Select value={form.marital_status} onValueChange={v => setForm(p => ({ ...p, marital_status: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{["Single","Married","Divorced","Widowed","Separated"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Phone(s)</Label><MultiContactInput mode="list" ghanaAware value={form.phone} onChange={(v) => setForm(p => ({ ...p, phone: v }))} /></div>
              <div><Label>Nationality</Label><CountryCombobox value={form.nationality} onValueChange={v => setForm(p => ({ ...p, nationality: v }))} /></div>
              <div><Label>Country of Origin</Label><CountryCombobox value={form.country_of_origin} onValueChange={v => setForm(p => ({ ...p, country_of_origin: v }))} /></div>
              <div><Label>ID Type</Label>
                <Select value={form.id_type} onValueChange={v => setForm(p => ({ ...p, id_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Passport", "Ghana Card", "Driver's Licence", "Voter's ID", "None"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>ID Number</Label><Input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} /></div>
              <div className="col-span-3"><Label>Home Address</Label><Input value={form.home_address} onChange={e => setForm(p => ({ ...p, home_address: e.target.value }))} /></div>
              <div><Label>Next of Kin (NoK)</Label><Input value={form.next_of_kin} onChange={e => setForm(p => ({ ...p, next_of_kin: e.target.value }))} /></div>
              <div><Label>Next of Kin (NoK) Phone</Label><ContactPhoneInput value={form.next_of_kin_phone} onChange={(v) => setForm(p => ({ ...p, next_of_kin_phone: v }))} compact /></div>
              <div><Label>Emergency Contact</Label><Input value={form.emergency_contact} onChange={e => setForm(p => ({ ...p, emergency_contact: e.target.value }))} /></div>
            </div>
          </div>

          <div className="border rounded-lg p-3 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Case Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type of Offense *</Label>
                <Select value={form.crime_type} onValueChange={v => setForm(p => ({ ...p, crime_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">{OFFENSE_GROUPS.map(g => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{g.group}</SelectLabel>
                      {g.options.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectGroup>
                  ))}</SelectContent>
                </Select>
              </div>
              <div><Label>Cell / Room</Label><Input value={form.cell_number} onChange={e => setForm(p => ({ ...p, cell_number: e.target.value }))} placeholder="e.g. C-01" /></div>
              <div className="col-span-2"><Label>Charge Description</Label><Textarea rows={2} value={form.charge_description} onChange={e => setForm(p => ({ ...p, charge_description: e.target.value }))} /></div>
              <div><Label>Location of Arrest</Label><Input value={form.location_of_arrest} onChange={e => setForm(p => ({ ...p, location_of_arrest: e.target.value }))} /></div>
              <div><Label>Arresting Officer</Label><StaffPicker value={null} label={form.arresting_officer_name || null} title="Select arresting officer" placeholder="Select officer from staff directory…" onChange={(_id, label) => setForm(p => ({ ...p, arresting_officer_name: label || "" }))} /></div>
              <div><Label>Risk Level *</Label>
                <Select value={form.risk_level} onValueChange={v => setForm(p => ({ ...p, risk_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "medium", "high", "critical"].map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="flex items-center gap-1"><Heart className="h-3 w-3 text-rose-500" />Medical Alerts</Label><Input value={form.medical_alerts} onChange={e => setForm(p => ({ ...p, medical_alerts: e.target.value }))} /></div>
              <ReferralSelect id="edit-referred-from" label="Referred from" value={form.referred_from} other={form.referred_from_other} options={REFERRAL_SOURCES} placeholder="Select referral source" onChange={v => setForm(p => ({ ...p, referred_from: v }))} onOtherChange={v => setForm(p => ({ ...p, referred_from_other: v }))} />
              <ReferralSelect id="edit-referred-to" label="Referred to" value={form.referred_to} other={form.referred_to_other} options={REFERRAL_DESTINATIONS} placeholder="Select receiving institution" onChange={v => setForm(p => ({ ...p, referred_to: v }))} onOtherChange={v => setForm(p => ({ ...p, referred_to_other: v }))} />
              <div className="col-span-2"><Label>Statement Approved by</Label><StatementApproverPicker value={approver.id} label={approver.label} canEdit={canApprove} onChange={(id, label) => setApprover({ id, label })} />{!canApprove && <p className="text-xs text-muted-foreground mt-1">Only Admin, OIC or 2IC may set the statement approver.</p>}</div>
              <div className="col-span-2"><Label>Additional Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => update.mutate()} disabled={update.isPending} className="bg-rose-600 hover:bg-rose-700">{update.isPending ? "Saving…" : "Save Changes"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------- INTAKE ----------------- */
function IntakeForm({ onClose, userId, role }: { onClose: () => void; userId?: string; role?: string | null }) {
  const qc = useQueryClient();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    first_name: "", last_name: "", alias: "", gender: "male", date_of_birth: "", marital_status: "",
    nationality: "", country_of_origin: "", id_type: "Passport", id_number: "",
    home_address: "", phone: "", next_of_kin: "", next_of_kin_phone: "", emergency_contact: "",
    crime_type: "Illegal Entry", charge_description: "", location_of_arrest: "",
    arresting_officer_name: "", cell_number: "", risk_level: "medium", medical_alerts: "", notes: "",
    referred_from: "", referred_to: "", referred_from_other: "", referred_to_other: "",
  });
  const canApprove = ["admin", "oic", "2ic"].includes(role || "");
  const [approver, setApprover] = useState<{ id: string | null; label: string | null }>({ id: null, label: null });
  // Duplicate detection state: matches found for the current identifiers.
  const [dupes, setDupes] = useState<DuplicateMatch[]>([]);
  const [dupesBlocked, setDupesBlocked] = useState(false);
  const [dupeDialog, setDupeDialog] = useState(false);
  const [checking, setChecking] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const problem = validateDetaineeForm(form);
      if (problem) throw new Error(problem);
      const phones = {
        phone: assertContactPhoneList(form.phone, "Phone"),
        next_of_kin_phone: assertContactPhoneList(form.next_of_kin_phone, "Next of Kin (NoK) Phone"),
      };
      let photo_url: string | null = null;
      if (photoFile) {
        const path = `${Date.now()}-${photoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("detention-photos").upload(path, photoFile);
        if (upErr) throw upErr;
        photo_url = path;
      }
      const payload: any = { ...form, ...phones, photo_url, created_by: userId };
      if (canApprove && approver.id) {
        payload.statement_approved_by = approver.id;
        payload.statement_approved_by_name = approver.label;
      }
      const { error } = await supabase.from("detention_records").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention_records"] }); toast.success("Detainee booked in"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  /**
   * Book-in entry point. Validates, then screens the identifiers against
   * existing records: a blocking match (same ID/passport already in custody)
   * stops the intake, a warning asks for confirmation, and a clean check books
   * the detainee straight in.
   */
  const handleBookIn = async () => {
    const problem = validateDetaineeForm(form);
    if (problem) { toast.error(problem); return; }
    setChecking(true);
    try {
      const { matches, blocked } = await checkDetaineeDuplicates(form);
      if (matches.length > 0) {
        setDupes(matches);
        setDupesBlocked(blocked);
        setDupeDialog(true);
        return;
      }
      create.mutate();
    } catch (e: any) {
      toast.error(e?.message || "Duplicate check failed — intake not created");
    } finally {
      setChecking(false);
    }
  };


  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-rose-600" />New Detainee Intake</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Biodata */}
          <div className="border rounded-lg p-3 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4" />Biodata</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><Label>First Name *</Label><Input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} /></div>
              <div><Label>Last Name *</Label><Input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} /></div>
              <div><Label>Alias</Label><Input value={form.alias} onChange={e => setForm(p => ({ ...p, alias: e.target.value }))} /></div>
              <div><Label>Gender *</Label>
                <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>{GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><div className="flex items-center justify-between gap-2 mb-1"><Label>Date of Birth ({DATE_FORMAT_HINT})</Label><AgeDisplay dob={form.date_of_birth} /></div><DateInput  value={form.date_of_birth} onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))} /></div>
              <div><Label>Marital Status</Label>
                <Select value={form.marital_status} onValueChange={v => setForm(p => ({ ...p, marital_status: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{["Single","Married","Divorced","Widowed","Separated"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Phone(s)</Label><MultiContactInput mode="list" ghanaAware value={form.phone} onChange={(v) => setForm(p => ({ ...p, phone: v }))} /></div>
              <div><Label>Nationality</Label><CountryCombobox value={form.nationality} onValueChange={v => setForm(p => ({ ...p, nationality: v }))} /></div>
              <div><Label>Country of Origin</Label><CountryCombobox value={form.country_of_origin} onValueChange={v => setForm(p => ({ ...p, country_of_origin: v }))} /></div>
              <div><Label>ID Type</Label>
                <Select value={form.id_type} onValueChange={v => setForm(p => ({ ...p, id_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Passport", "Ghana Card", "Driver's Licence", "Voter's ID", "None"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>ID Number</Label><Input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} /></div>
              <div className="col-span-3"><Label>Home Address</Label><Input value={form.home_address} onChange={e => setForm(p => ({ ...p, home_address: e.target.value }))} /></div>
              <div><Label>Next of Kin (NoK)</Label><Input value={form.next_of_kin} onChange={e => setForm(p => ({ ...p, next_of_kin: e.target.value }))} /></div>
              <div><Label>Next of Kin (NoK) Phone</Label><ContactPhoneInput value={form.next_of_kin_phone} onChange={(v) => setForm(p => ({ ...p, next_of_kin_phone: v }))} compact /></div>
              <div><Label>Emergency Contact</Label><Input value={form.emergency_contact} onChange={e => setForm(p => ({ ...p, emergency_contact: e.target.value }))} /></div>
            </div>
            <div>
              <Label className="flex items-center gap-1"><Camera className="h-3 w-3" /> Photo (mugshot)</Label>
              <Input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
            </div>
          </div>

          {/* Case */}
          <div className="border rounded-lg p-3 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Case Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type of Offense *</Label>
                <Select value={form.crime_type} onValueChange={v => setForm(p => ({ ...p, crime_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">{OFFENSE_GROUPS.map(g => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{g.group}</SelectLabel>
                      {g.options.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectGroup>
                  ))}</SelectContent>
                </Select>
              </div>
              <div><Label>Cell / Room</Label><Input value={form.cell_number} onChange={e => setForm(p => ({ ...p, cell_number: e.target.value }))} placeholder="e.g. C-01" /></div>
              <div className="col-span-2"><Label>Charge Description</Label><Textarea rows={2} value={form.charge_description} onChange={e => setForm(p => ({ ...p, charge_description: e.target.value }))} /></div>
              <div><Label>Location of Arrest</Label><Input value={form.location_of_arrest} onChange={e => setForm(p => ({ ...p, location_of_arrest: e.target.value }))} /></div>
              <div><Label>Arresting Officer</Label><StaffPicker value={null} label={form.arresting_officer_name || null} title="Select arresting officer" placeholder="Select officer from staff directory…" onChange={(_id, label) => setForm(p => ({ ...p, arresting_officer_name: label || "" }))} /></div>
              <div><Label>Risk Level *</Label>
                <Select value={form.risk_level} onValueChange={v => setForm(p => ({ ...p, risk_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "medium", "high", "critical"].map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="flex items-center gap-1"><Heart className="h-3 w-3 text-rose-500" />Medical Alerts</Label><Input value={form.medical_alerts} onChange={e => setForm(p => ({ ...p, medical_alerts: e.target.value }))} placeholder="e.g. diabetic, allergies" /></div>
              <ReferralSelect id="intake-referred-from" label="Referred from" value={form.referred_from} other={form.referred_from_other} options={REFERRAL_SOURCES} placeholder="Select referral source" onChange={v => setForm(p => ({ ...p, referred_from: v }))} onOtherChange={v => setForm(p => ({ ...p, referred_from_other: v }))} />
              <ReferralSelect id="intake-referred-to" label="Referred to" value={form.referred_to} other={form.referred_to_other} options={REFERRAL_DESTINATIONS} placeholder="Select receiving institution" onChange={v => setForm(p => ({ ...p, referred_to: v }))} onOtherChange={v => setForm(p => ({ ...p, referred_to_other: v }))} />
              <div className="col-span-2"><Label>Statement Approved by</Label><StatementApproverPicker value={approver.id} label={approver.label} canEdit={canApprove} onChange={(id, label) => setApprover({ id, label })} />{!canApprove && <p className="text-xs text-muted-foreground mt-1">Only Admin, OIC or 2IC may set the statement approver.</p>}</div>
              <div className="col-span-2"><Label>Additional Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleBookIn} disabled={create.isPending || checking} className="bg-rose-600 hover:bg-rose-700">
              {checking ? "Checking for duplicates…" : create.isPending ? "Booking…" : "Book In"}
            </Button>
          </div>
        </div>

        <DuplicateCheckDialog
          open={dupeDialog}
          matches={dupes}
          blocked={dupesBlocked}
          statusLabel={statusLabel}
          proceeding={create.isPending}
          onCancel={() => setDupeDialog(false)}
          onProceed={() => { setDupeDialog(false); create.mutate(); }}
        />
      </DialogContent>
    </Dialog>

  );
}

/* ----------------- DETAIL DRAWER ----------------- */
function DetainDetailDrawer({ record, onClose, userId, role }: { record: any; onClose: () => void; userId?: string; role: string | null }) {
  const qc = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const canCommand = ["admin", "oic", "2ic"].includes(role || "");
  const viewer: FieldContext = { role: role as any };


  useEffect(() => {
    if (record.photo_url) {
      supabase.storage.from("detention-photos").createSignedUrl(record.photo_url, 3600).then(({ data }) => setPhotoUrl(data?.signedUrl || null));
    }
  }, [record.photo_url]);

  const { data: detail } = useQuery({
    queryKey: ["detention-detail", record.id],
    queryFn: async () => {
      const [prop, vis, med, tr] = await Promise.all([
        supabase.from("detention_property_log").select("*").eq("detention_id", record.id).order("logged_at", { ascending: false }),
        supabase.from("detention_visitor_log").select("*").eq("detention_id", record.id).order("visit_start", { ascending: false }),
        supabase.from("detention_medical_log").select("*").eq("detention_id", record.id).order("attended_at", { ascending: false }),
        supabase.from("detention_transfers").select("*").eq("detention_id", record.id).order("transferred_at", { ascending: false }),
      ]);
      return { property: prop.data || [], visitors: vis.data || [], medical: med.data || [], transfers: tr.data || [] };
    },
  });

  const release = useMutation({
    mutationFn: async ({ outcome, reason }: { outcome: string; reason: string }) => {
      if (!canCommand) throw new Error("Only command can release");
      if (!reason.trim()) throw new Error("A reason is required when a detainee leaves custody");
      const { error } = await supabase.rpc("set_record_status", {
        _entity: "detention_records",
        _id: record.id,
        _status: outcome,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["detention_records"] }); qc.invalidateQueries({ queryKey: ["detention-detail", record.id] }); qc.invalidateQueries({ queryKey: ["status-history", "detention_records", record.id] }); toast.success(`Detainee marked as ${statusLabel(vars.outcome)}`); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {photoUrl && <AvatarImage src={photoUrl} />}
              <AvatarFallback className="bg-rose-100 text-rose-700">{record.first_name[0]}{record.last_name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <div>{record.first_name} {record.last_name} {record.alias && <span className="text-sm text-muted-foreground">aka "{record.alias}"</span>}</div>
              <div className="flex gap-1.5 mt-1">
                <StatusWorkflowControl
                  entity="detention_records"
                  recordId={record.id}
                  status={record.status}
                  canChange={canCommand}
                  compact
                  invalidateKeys={[["detention_records"], ["detention-detail", record.id]]}
                />
                <Badge className={RISK_COLORS[record.risk_level]}>{record.risk_level} risk</Badge>
                {record.medical_alerts && <Badge variant="outline" className="border-rose-400"><Heart className="h-3 w-3 mr-1 text-rose-500" />Medical</Badge>}
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="bio" className="mt-4">
          <TabsList className="flex flex-wrap h-auto bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/50 p-1">
            <TabsTrigger value="bio" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white">Profile</TabsTrigger>
            <TabsTrigger value="property" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white"><Package className="h-3.5 w-3.5 mr-1 text-amber-700 dark:text-amber-400" />Property ({detail?.property.length || 0})</TabsTrigger>
            <TabsTrigger value="visitors" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white"><Users className="h-3.5 w-3.5 mr-1 text-cyan-700 dark:text-cyan-400" />Visitors ({detail?.visitors.length || 0})</TabsTrigger>
            <TabsTrigger value="medical" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"><Stethoscope className="h-3.5 w-3.5 mr-1 text-emerald-700 dark:text-emerald-400" />Medical ({detail?.medical.length || 0})</TabsTrigger>
            <TabsTrigger value="transfers" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white"><ArrowRightLeft className="h-3.5 w-3.5 mr-1 text-indigo-700 dark:text-indigo-400" />Transfers ({detail?.transfers.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="bio" className="space-y-3">
            <Section title="Identification">
              <Field label="Gender" value={record.gender} />
              <Field label="Date of Birth" value={canSeeField("detainee_identity", viewer) ? formatDate(record.date_of_birth) : "••/••/••••"} />
              <Field label="Age" value={ageLabel(record.date_of_birth)} />
              <Field label="Nationality" value={record.nationality} />
              <Field label="Country of Origin" value={record.country_of_origin} />
              <Field label="ID Type" value={record.id_type} />
              <Field label="ID Number" value={<Sensitive field="detainee_identity" value={record.id_number} revealable entityType="detention_record" recordId={record.id} />} />
              <Field label="Phone" value={<Sensitive field="detainee_contact" value={record.phone} revealable entityType="detention_record" recordId={record.id} />} />
              <Field label="Home Address" value={<Sensitive field="detainee_contact" value={record.home_address} revealable entityType="detention_record" recordId={record.id} />} full />

            </Section>
            <Section title="Case">
              <Field label="Type of Offense" value={record.crime_type} />
              <Field label="Cell" value={record.cell_number} />
              <Field label="Charge" value={record.charge_description} full />
              <Field label="Arrest Location" value={record.location_of_arrest} />
              <Field label="Arresting Officer" value={record.arresting_officer_name} />
              <Field label="Referred from" value={referralDisplay(record.referred_from, record.referred_from_other)} />
              <Field label="Referred to" value={referralDisplay(record.referred_to, record.referred_to_other)} />
              <Field label="Statement Approved by" value={record.statement_approved_by_name} />
              <Field label="Intake" value={formatDateTime(record.intake_at)} />
              <Field label="Custody Duration" value={`${differenceInHours(record.released_at ? new Date(record.released_at) : new Date(), new Date(record.intake_at))} hrs`} />
              {record.medical_alerts && <Field label="⚠ Medical Alerts" value={record.medical_alerts} full />}
              {record.notes && <Field label="Notes" value={record.notes} full />}
            </Section>
            <Section title="Next of Kin (NoK) / Emergency">
              <Field label="Next of Kin (NoK)" value={<Sensitive field="next_of_kin" value={record.next_of_kin} revealable entityType="detention_record" recordId={record.id} />} />
              <Field label="Next of Kin (NoK) Phone" value={<Sensitive field="next_of_kin" value={record.next_of_kin_phone} revealable entityType="detention_record" recordId={record.id} />} />
              <Field label="Emergency Contact" value={<Sensitive field="detainee_contact" value={record.emergency_contact} revealable entityType="detention_record" recordId={record.id} />} full />
            </Section>

            <Section title="Status audit trail">
              <div className="col-span-2">
                <StatusHistoryList entity="detention_records" recordId={record.id} />
              </div>
            </Section>
            {record.status === "in_custody" && canCommand && <ReleaseAction onRelease={(outcome, reason) => release.mutate({ outcome, reason })} pending={release.isPending} />}
          </TabsContent>

          <TabsContent value="property"><PropertyLog records={detail?.property || []} detentionId={record.id} userId={userId} canEdit={record.status === "in_custody"} /></TabsContent>
          <TabsContent value="visitors"><VisitorLog records={detail?.visitors || []} detentionId={record.id} userId={userId} canEdit={record.status === "in_custody"} /></TabsContent>
          <TabsContent value="medical"><MedicalLog records={detail?.medical || []} detentionId={record.id} userId={userId} canEdit={record.status === "in_custody"} /></TabsContent>
          <TabsContent value="transfers"><TransferLog records={detail?.transfers || []} detentionId={record.id} userId={userId} canEdit={record.status === "in_custody" && canCommand} /></TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: any) {
  return <div className="space-y-2"><h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">{title}</h4><div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{children}</div></div>;
}
function Field({ label, value, full }: { label: string; value: any; full?: boolean }) {
  return <div className={full ? "col-span-2" : ""}><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium capitalize">{value || "—"}</div></div>;
}

function ReleaseAction({ onRelease, pending }: { onRelease: (outcome: string, reason: string) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("released");
  const [reason, setReason] = useState("");
  return (
    <div className="border-t pt-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="w-full bg-emerald-600 hover:bg-emerald-700">Close Custody / Release</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Custody Status</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Outcome *</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELEASE_OUTCOMES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason / Notes *</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="e.g. Bail granted on GHS 10,000, repatriated to Nigeria via KIA, transferred to court for hearing…" />
            </div>
            <Button onClick={() => { if (reason.trim()) { onRelease(outcome, reason); setOpen(false); } else toast.error("Reason required"); }} disabled={pending} className="w-full bg-emerald-600 hover:bg-emerald-700">{pending ? "Saving…" : "Confirm"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PropertyLog({ records, detentionId, userId, canEdit }: any) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_description: "", quantity: 1, condition: "good", notes: "" });
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("detention_property_log").insert({ ...form, detention_id: detentionId, logged_by: userId }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention-detail", detentionId] }); setOpen(false); setForm({ item_description: "", quantity: 1, condition: "good", notes: "" }); toast.success("Property logged"); },
  });
  return (
    <div className="space-y-2">
      {canEdit && <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-3.5 w-3.5" />Log Property</Button>}
      {records.length === 0 ? <p className="text-sm text-muted-foreground py-4">No property logged.</p> :
        <div className="space-y-2">{records.map((r: any) => <Card key={r.id} className="p-3"><div className="flex justify-between"><div><div className="font-medium">{r.item_description}</div><div className="text-xs text-muted-foreground">Qty: {r.quantity} · {r.condition || "—"}</div></div><div className="text-xs text-muted-foreground">{formatDateTime(r.logged_at)}</div></div>{r.notes && <p className="text-xs mt-1">{r.notes}</p>}</Card>)}</div>}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Log Property</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Description *</Label><Input value={form.item_description} onChange={e => setForm(p => ({ ...p, item_description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Quantity</Label><Input type="number" min={1} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))} /></div>
            <div><Label>Condition</Label><Input value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value }))} /></div></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">{add.isPending ? "Saving…" : "Log"}</Button></div></DialogContent></Dialog>
    </div>
  );
}
function VisitorLog({ records, detentionId, userId, canEdit }: any) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ visitor_name: "", relationship: "", id_number: "", phone: "", notes: "" });
  const add = useMutation({
    mutationFn: async () => { const phone = assertGhanaPhoneList(form.phone, "Visitor phone"); const { error } = await supabase.from("detention_visitor_log").insert({ ...form, phone, detention_id: detentionId, approved_by: userId }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention-detail", detentionId] }); setOpen(false); setForm({ visitor_name: "", relationship: "", id_number: "", phone: "", notes: "" }); toast.success("Visitor logged"); },
  });
  return (
    <div className="space-y-2">
      {canEdit && <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-3.5 w-3.5" />Log Visitor</Button>}
      {records.length === 0 ? <p className="text-sm text-muted-foreground py-4">No visitors recorded.</p> :
        records.map((r: any) => <Card key={r.id} className="p-3"><div className="flex justify-between"><div><div className="font-medium">{r.visitor_name}</div><div className="text-xs text-muted-foreground">{r.relationship || "—"} · {r.phone || "—"}</div></div><div className="text-xs text-muted-foreground">{formatDateTime(r.visit_start)}</div></div>{r.notes && <p className="text-xs mt-1">{r.notes}</p>}</Card>)}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Log Visitor</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Visitor Name *</Label><Input value={form.visitor_name} onChange={e => setForm(p => ({ ...p, visitor_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Relationship</Label><Input value={form.relationship} onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))} /></div>
            <div><Label>ID Number</Label><Input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} /></div></div>
          <div><Label>Phone(s)</Label><MultiContactInput mode="list" ghana value={form.phone} onChange={(v) => setForm(p => ({ ...p, phone: v }))} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">{add.isPending ? "Saving…" : "Log"}</Button></div></DialogContent></Dialog>
    </div>
  );
}
function MedicalLog({ records, detentionId, userId, canEdit }: any) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ complaint: "", treatment: "", attended_by: "", notes: "" });
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("detention_medical_log").insert({ ...form, detention_id: detentionId, logged_by: userId }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention-detail", detentionId] }); setOpen(false); setForm({ complaint: "", treatment: "", attended_by: "", notes: "" }); toast.success("Medical record added"); },
  });
  return (
    <div className="space-y-2">
      {canEdit && <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-3.5 w-3.5" />Add Record</Button>}
      {records.length === 0 ? <p className="text-sm text-muted-foreground py-4">No medical records.</p> :
        records.map((r: any) => <Card key={r.id} className="p-3"><div className="flex justify-between"><div><div className="font-medium">{r.complaint}</div>{r.treatment && <div className="text-xs">{r.treatment}</div>}<div className="text-xs text-muted-foreground">{r.attended_by || "—"}</div></div><div className="text-xs text-muted-foreground">{formatDateTime(r.attended_at)}</div></div></Card>)}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Medical Record</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Complaint *</Label><Input value={form.complaint} onChange={e => setForm(p => ({ ...p, complaint: e.target.value }))} /></div>
          <div><Label>Treatment</Label><Textarea rows={2} value={form.treatment} onChange={e => setForm(p => ({ ...p, treatment: e.target.value }))} /></div>
          <div><Label>Attended By</Label><Input value={form.attended_by} onChange={e => setForm(p => ({ ...p, attended_by: e.target.value }))} placeholder="Medic / clinic name" /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">{add.isPending ? "Saving…" : "Add"}</Button></div></DialogContent></Dialog>
    </div>
  );
}
function TransferLog({ records, detentionId, userId, canEdit }: any) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ from_location: "", to_location: "", reason: "", escorted_by: "" });
  const add = useMutation({
    mutationFn: async () => {
      if (!form.to_location) throw new Error("Destination required");
      const { error: e1 } = await supabase.from("detention_transfers").insert({ ...form, detention_id: detentionId, performed_by: userId });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("detention_records").update({ status: "transferred" }).eq("id", detentionId);
      if (e2) throw e2;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention-detail", detentionId] }); qc.invalidateQueries({ queryKey: ["detention_records"] }); setOpen(false); setForm({ from_location: "", to_location: "", reason: "", escorted_by: "" }); toast.success("Transfer logged"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      {canEdit && <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-3.5 w-3.5" />Record Transfer</Button>}
      {records.length === 0 ? <p className="text-sm text-muted-foreground py-4">No transfers.</p> :
        records.map((r: any) => <Card key={r.id} className="p-3"><div className="flex justify-between"><div><div className="font-medium">{r.from_location || "Holding"} → {r.to_location}</div>{r.reason && <div className="text-xs">{r.reason}</div>}<div className="text-xs text-muted-foreground">Escort: {r.escorted_by || "—"}</div></div><div className="text-xs text-muted-foreground">{formatDateTime(r.transferred_at)}</div></div></Card>)}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Record Transfer</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>From</Label><Input value={form.from_location} onChange={e => setForm(p => ({ ...p, from_location: e.target.value }))} placeholder="Default: Holding" /></div>
          <div><Label>To *</Label><Input value={form.to_location} onChange={e => setForm(p => ({ ...p, to_location: e.target.value }))} placeholder="e.g. Court, HQ, Hospital" /></div>
          <div><Label>Reason</Label><Textarea rows={2} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} /></div>
          <div><Label>Escorted By</Label><Input value={form.escorted_by} onChange={e => setForm(p => ({ ...p, escorted_by: e.target.value }))} /></div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">{add.isPending ? "Saving…" : "Confirm Transfer"}</Button></div></DialogContent></Dialog>
    </div>
  );
}

/* ----------------- ANALYTICS ----------------- */
type AnalyticsRange = "7d" | "30d" | "90d" | "12m" | "all";
const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months", all: "All time",
};
const STAY_BUCKETS = [
  { name: "< 24 hrs", test: (h: number) => h < 24 },
  { name: "1–3 days", test: (h: number) => h >= 24 && h < 72 },
  { name: "4–7 days", test: (h: number) => h >= 72 && h < 168 },
  { name: "8–30 days", test: (h: number) => h >= 168 && h < 720 },
  { name: "30+ days", test: (h: number) => h >= 720 },
];

/**
 * Holding / Detention Center analytics dashboard.
 *
 * Standardised custody-reporting layout: filter bar → KPI band → trend and
 * distribution charts → summary tables, with CSV export and print of exactly
 * the filtered view on screen.
 */
function HoldingAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ["holding-analytics"],
    queryFn: async () => (await supabase.from("detention_records").select("*")).data || [],
    refetchInterval: 30_000,
  });

  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [fStatus, setFStatus] = useState("all");
  const [fGender, setFGender] = useState("all");
  const [fRisk, setFRisk] = useState("all");
  const [fOffense, setFOffense] = useState("all");
  const [fNationality, setFNationality] = useState("");

  const rangeStart = useMemo(() => {
    const now = new Date();
    switch (range) {
      case "7d": return startOfDay(subDays(now, 6));
      case "30d": return startOfDay(subDays(now, 29));
      case "90d": return startOfDay(subDays(now, 89));
      case "12m": return startOfDay(subMonths(now, 12));
      default: return null;
    }
  }, [range]);

  const records = data ?? [];

  const rows = useMemo(() => records.filter((r: any) => {
    if (rangeStart && new Date(r.intake_at) < rangeStart) return false;
    if (fStatus !== "all") {
      const s = r.status === "deported" ? "repatriated" : r.status;
      if (s !== fStatus) return false;
    }
    if (fGender !== "all" && (r.gender || "") !== fGender) return false;
    if (fRisk !== "all" && (r.risk_level || "") !== fRisk) return false;
    if (fOffense !== "all" && offenseCategory(r.crime_type) !== fOffense) return false;
    if (fNationality && (r.nationality || "").toLowerCase() !== fNationality.toLowerCase()) return false;
    return true;
  }), [records, rangeStart, fStatus, fGender, fRisk, fOffense, fNationality]);

  const stats = useMemo(() => {
    const is = (s: string) => rows.filter((r: any) => (r.status === "deported" ? "repatriated" : r.status) === s).length;
    const closed = rows.filter((r: any) => r.released_at);
    const stayHours = closed.map((r: any) => Math.max(0, differenceInHours(new Date(r.released_at), new Date(r.intake_at))));
    const avgStay = stayHours.length ? stayHours.reduce((a, b) => a + b, 0) / stayHours.length : 0;
    const approved = rows.filter((r: any) => r.statement_approved_by_name || r.statement_approved_by).length;
    const cells = new Set(rows.filter((r: any) => r.status === "in_custody" && r.cell_number).map((r: any) => r.cell_number));
    return {
      admissions: rows.length,
      inCustody: is("in_custody"),
      released: is("released"),
      onBail: is("bail"),
      repatriated: is("repatriated"),
      transferred: is("transferred"),
      escaped: is("escaped"),
      avgStay,
      cellsOccupied: cells.size,
      approvalRate: rows.length ? Math.round((approved / rows.length) * 100) : 0,
      stayHours,
    };
  }, [rows]);

  const groupBy = (key: string, limit?: number) => {
    const m: Record<string, number> = {};
    rows.forEach((r: any) => { const k = r[key] || "Unknown"; m[k] = (m[k] || 0) + 1; });
    const list = Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return limit ? list.slice(0, limit) : list;
  };

  const byGender = useMemo(() => groupBy("gender").map(g => ({ ...g, name: g.name.charAt(0).toUpperCase() + g.name.slice(1) })), [rows]);
  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r: any) => { const k = statusLabel(r.status); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rows]);
  const byOffense = useMemo(() => groupBy("crime_type", 12), [rows]);
  const byOffenseCategory = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r: any) => { const k = offenseCategory(r.crime_type); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rows]);
  const byNation = useMemo(() => groupBy("nationality", 10), [rows]);
  const byLoc = useMemo(() => groupBy("location_of_arrest", 10), [rows]);
  const byRisk = useMemo(() => groupBy("risk_level").map(r => ({ ...r, name: r.name.charAt(0).toUpperCase() + r.name.slice(1) })), [rows]);
  const byAge = useMemo(() => {
    const order = ["Under 18", "18–25", "26–35", "36–45", "46–60", "60+", "Unknown"];
    const m: Record<string, number> = {};
    rows.forEach((r: any) => { const k = ageGroup(r.date_of_birth); m[k] = (m[k] || 0) + 1; });
    return order.filter(k => m[k]).map(name => ({ name, value: m[name] }));
  }, [rows]);
  const stayDistribution = useMemo(
    () => STAY_BUCKETS.map(b => ({ name: b.name, value: stats.stayHours.filter(b.test).length })),
    [stats.stayHours],
  );

  // Admissions vs. releases over time (daily for ≤90d ranges, monthly otherwise)
  const flow = useMemo(() => {
    const monthly = range === "12m" || range === "all";
    const keyOf = (d: Date) => (monthly ? format(d, "MM/yyyy") : format(d, "dd/MM"));
    const buckets: { key: string; admissions: number; releases: number }[] = [];
    const index: Record<string, number> = {};
    const start = rangeStart ?? (rows.length ? new Date(Math.min(...rows.map((r: any) => +new Date(r.intake_at)))) : new Date());
    const end = new Date();
    const step = monthly ? 30 : 1;
    for (let d = new Date(start); d <= end; d = new Date(+d + step * 86400000)) {
      const k = keyOf(d);
      if (index[k] === undefined) { index[k] = buckets.length; buckets.push({ key: k, admissions: 0, releases: 0 }); }
    }
    rows.forEach((r: any) => {
      const ak = keyOf(new Date(r.intake_at));
      if (index[ak] !== undefined) buckets[index[ak]].admissions++;
      if (r.released_at) {
        const rk = keyOf(new Date(r.released_at));
        if (index[rk] !== undefined) buckets[index[rk]].releases++;
      }
    });
    return buckets;
  }, [rows, range, rangeStart]);

  const nationalities = useMemo(
    () => [...new Set(records.map((r: any) => r.nationality).filter(Boolean))].sort() as string[],
    [records],
  );

  const filterSummary = [
    `Period: ${RANGE_LABELS[range]}`,
    `Status: ${fStatus === "all" ? "All" : statusLabel(fStatus)}`,
    `Gender: ${fGender === "all" ? "All" : fGender}`,
    `Risk: ${fRisk === "all" ? "All" : fRisk}`,
    `Offense category: ${fOffense === "all" ? "All" : fOffense}`,
    `Nationality: ${fNationality || "All"}`,
  ].join(" · ");

  const exportData = () => ({
    title: "Detention Analytics",
    filename: `detention-analytics-${format(new Date(), "yyyy-MM-dd")}`,
    headers: ["Section", "Item", "Count", "Share of total"],
    rows: [
      ["Filters", filterSummary, "", ""],
      ["Generated", formatDateTime(new Date()), "", ""],
      ["KPI", "Admissions in period", String(stats.admissions), ""],
      ["KPI", "Currently in custody", String(stats.inCustody), ""],
      ["KPI", "Released", String(stats.released), ""],
      ["KPI", "On bail", String(stats.onBail), ""],
      ["KPI", "Repatriated", String(stats.repatriated), ""],
      ["KPI", "Transferred", String(stats.transferred), ""],
      ["KPI", "Escapes", String(stats.escaped), ""],
      ["KPI", "Average length of stay (hrs)", String(Math.round(stats.avgStay)), ""],
      ["KPI", "Cells occupied", String(stats.cellsOccupied), ""],
      ["KPI", "Statement approval completion (%)", String(stats.approvalRate), ""],
      ...byOffenseCategory.map(o => ["Offense category", o.name, String(o.value), `${share(o.value, stats.admissions)}%`]),
      ...byOffense.map(o => ["Type of offense", o.name, String(o.value), `${share(o.value, stats.admissions)}%`]),
      ...byNation.map(n => ["Nationality", n.name, String(n.value), `${share(n.value, stats.admissions)}%`]),
      ...stayDistribution.map(s => ["Length of stay", s.name, String(s.value), ""]),
    ],
  });

  const printReport = () => {
    const esc = (s: any) => String(s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const table = (title: string, list: { name: string; value: number }[]) => `
      <h4>${esc(title)}</h4>
      <table><thead><tr><th>Item</th><th>Count</th><th>Share</th></tr></thead><tbody>
      ${list.map(i => `<tr><td>${esc(i.name)}</td><td>${i.value}</td><td>${share(i.value, stats.admissions)}%</td></tr>`).join("")}
      </tbody></table>`;
    const html = `<!DOCTYPE html><html><head><title>Detention Analytics</title><style>
      @media print { @page { size: A4 portrait; margin: 14mm; } }
      body { font-family: system-ui, sans-serif; color: #1e293b; padding: 18px; }
      h2 { color: #be123c; margin: 0 0 2px; font-size: 16px; }
      h3 { margin: 0 0 8px; font-size: 13px; }
      h4 { margin: 16px 0 4px; font-size: 12px; }
      .meta { font-size: 10px; color: #666; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e2e8f0; padding: 5px 8px; font-size: 11px; text-align: left; }
      th { background: #f1f5f9; }
      .kpis { display: flex; flex-wrap: wrap; gap: 6px; }
      .kpi { border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 11px; }
      .footer { text-align: center; margin-top: 16px; font-size: 9px; color: #888; }
    </style></head><body>
      <h2>Cybernet HRM System</h2>
      <h3>Holding / Detention Center — Analytics Report</h3>
      <div class="meta">${esc(filterSummary)}<br/>Generated: ${formatDateTime(new Date())}</div>
      <div class="kpis">
        ${[["Admissions", stats.admissions], ["In Custody", stats.inCustody], ["On Bail", stats.onBail],
           ["Released", stats.released], ["Repatriated", stats.repatriated], ["Transferred", stats.transferred],
           ["Escapes", stats.escaped], ["Avg Stay (hrs)", Math.round(stats.avgStay)],
           ["Cells Occupied", stats.cellsOccupied], ["Statement Approval", `${stats.approvalRate}%`]]
          .map(([l, v]) => `<div class="kpi"><strong>${esc(v)}</strong><br/>${esc(l)}</div>`).join("")}
      </div>
      ${table("Offense categories", byOffenseCategory)}
      ${table("Type of offense", byOffense)}
      ${table("Nationalities", byNation)}
      ${table("Length of stay", stayDistribution)}
      <div class="footer">CONFIDENTIAL — Ghana Immigration Service</div>
    </body></html>`;
    openPrintWindow(html, { features: "noopener,noreferrer,width=900,height=700", autoPrint: true, printDelayMs: 500 });
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading analytics…</div>;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as AnalyticsRange)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(RANGE_LABELS) as AnalyticsRange[]).map(k => <SelectItem key={k} value={k}>{RANGE_LABELS[k]}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["in_custody", "bail", "released", "repatriated", "transferred", "court", "escaped"].map(s => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fGender} onValueChange={setFGender}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All genders</SelectItem>{GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fRisk} onValueChange={setFRisk}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All risk</SelectItem>{["low", "medium", "high", "critical"].map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fOffense} onValueChange={setFOffense}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All offense categories</SelectItem>
              {OFFENSE_GROUPS.map(g => <SelectItem key={g.group} value={g.group}>{g.group}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fNationality || "all"} onValueChange={(v) => setFNationality(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All nationalities</SelectItem>
              {nationalities.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <ExportMenu getData={exportData} />
            <Button variant="outline" size="sm" onClick={printReport} className="gap-1"><Printer className="h-4 w-4" />Print</Button>
          </div>
          <p className="w-full text-xs text-muted-foreground">{filterSummary} · {stats.admissions} record{stats.admissions === 1 ? "" : "s"} in view</p>
        </CardContent>
      </Card>

      {/* KPI band */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPI title="In Custody" value={stats.inCustody} icon={Lock} color="text-rose-600" bg="bg-rose-50 dark:bg-rose-950/40" />
        <KPI title="Admissions" value={stats.admissions} icon={Activity} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/40" />
        <KPI title="Released" value={stats.released} icon={UserCheck} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/40" />
        <KPI title="On Bail" value={stats.onBail} icon={Gavel} color="text-cyan-600" bg="bg-cyan-50 dark:bg-cyan-950/40" />
        <KPI title="Repatriated" value={stats.repatriated} icon={ArrowRightLeft} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-950/40" />
        <KPI title="Transferred" value={stats.transferred} icon={ArrowRightLeft} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/40" />
        <KPI title="Escapes" value={stats.escaped} icon={AlertTriangle} color="text-red-700" bg="bg-red-100 dark:bg-red-950/50" />
        <KPI title="Avg Length of Stay" value={`${Math.round(stats.avgStay)} hrs`} icon={Activity} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/40" />
        <KPI title="Cells Occupied" value={stats.cellsOccupied} icon={Lock} color="text-slate-600" bg="bg-slate-50 dark:bg-slate-900/40" />
        <KPI title="Statement Approval" value={`${stats.approvalRate}%`} icon={ShieldAlert} color="text-teal-600" bg="bg-teal-50 dark:bg-teal-950/40" />
      </div>

      {stats.admissions === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No custody records match the selected filters.</CardContent></Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-sm">Admissions vs. Releases</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={flow}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="key" fontSize={10} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend />
                  <Area type="monotone" dataKey="admissions" name="Admissions" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} />
                  <Area type="monotone" dataKey="releases" name="Releases" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-sm">Length of Stay Distribution</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={230}><BarChart data={stayDistribution}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Detainees" fill="#f59e0b" /></BarChart></ResponsiveContainer>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-sm">Custody Status Composition</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={230}><PieChart><Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} label>{byStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
            </CardContent></Card>

            <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-sm">Type of Offense (Top 12)</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={Math.max(240, byOffense.length * 26)}><BarChart data={byOffense} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis dataKey="name" type="category" width={190} fontSize={10} /><Tooltip /><Bar dataKey="value" name="Cases" fill="#ef4444" /></BarChart></ResponsiveContainer>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-sm">Top Nationalities</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={250}><BarChart data={byNation} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis dataKey="name" type="category" width={120} fontSize={10} /><Tooltip /><Bar dataKey="value" name="Detainees" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-sm">Top Arrest Locations</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={250}><BarChart data={byLoc} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis dataKey="name" type="category" width={120} fontSize={10} /><Tooltip /><Bar dataKey="value" name="Arrests" fill="#8b5cf6" /></BarChart></ResponsiveContainer>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-sm">Gender Distribution</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={byGender} dataKey="value" nameKey="name" outerRadius={78} label>{byGender.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-sm">Age Groups</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={220}><BarChart data={byAge}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Detainees" fill="#06b6d4" /></BarChart></ResponsiveContainer>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-sm">Risk Level</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={byRisk} dataKey="value" nameKey="name" outerRadius={78} label>{byRisk.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
            </CardContent></Card>
          </div>

          {/* Summary tables */}
          <div className="grid lg:grid-cols-2 gap-4">
            <SummaryTable title="Offense Category Summary" caption="Count and share of records in view" list={byOffenseCategory} total={stats.admissions} />
            <SummaryTable title="Nationality Summary" caption="Top 10 nationalities in view" list={byNation} total={stats.admissions} />
          </div>
        </>
      )}
    </div>
  );
}

const share = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 1000) / 10 : 0);

function SummaryTable({ title, caption, list, total }: { title: string; caption: string; list: { name: string; value: number }[]; total: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle><p className="text-xs text-muted-foreground">{caption}</p></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No data</TableCell></TableRow>
                : list.map(i => (
                  <TableRow key={i.name}>
                    <TableCell>{i.name}</TableCell>
                    <TableCell className="text-right font-medium">{i.value}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{share(i.value, total)}%</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}


function KPI({ title, value, icon: Icon, color, bg }: any) {
  return (
    <Card className={`${bg} border-2`}>
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent className="px-3 pb-3"><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}
