import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthContext } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, FileDown, ShieldAlert, Search, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

const STATUS_COLOR: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-900",
  pending: "bg-amber-100 text-amber-900",
  reviewed: "bg-sky-100 text-sky-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

type SortKey = "created_at" | "start_date" | "end_date" | "status";

const PAGE_SIZES = [10, 25, 50];

export default function MyExcuseDutySubmissions() {
  const { user } = useAuth();
  const { isAdminOrSupervisor, isHoa } = useAuthContext();
  const isReviewer = isAdminOrSupervisor || isHoa;

  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // Filters
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const resetFilters = () => {
    setFromDate(""); setToDate(""); setStatusFilter("all"); setSearchInput(""); setSearch(""); setPage(0);
  };

  const { data: profile } = useQuery({
    queryKey: ["my-profile-mysubs"],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, phone, email, shift_group, office, ranks(name, abbreviation), departments(name)")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!user,
  });

  // Server-side text match against own profile (officer name / staff ID).
  // Since this view only shows the current user's submissions, the search either
  // matches their profile (returning all rows) or returns nothing.
  const searchMatchesMe = useMemo(() => {
    if (!search) return true;
    if (!profile) return false;
    const hay = `${profile.first_name ?? ""} ${profile.last_name ?? ""} ${profile.staff_id ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  }, [search, profile]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-excuse-subs", user?.id, sortKey, sortDir, page, pageSize, fromDate, toDate, statusFilter, search, searchMatchesMe],
    queryFn: async () => {
      if (search && !searchMatchesMe) return { rows: [] as any[], total: 0 };
      const from = page * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from("excuse_duty_forms" as any)
        .select("*", { count: "exact" })
        .eq("submitted_by", user!.id);
      // Date range applies to the duty period (overlap)
      if (fromDate) q = q.gte("end_date", fromDate);
      if (toDate) q = q.lte("start_date", toDate);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error, count } = await q
        .order(sortKey, { ascending: sortDir === "asc" })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as any[], total: count ?? 0 };
    },
    enabled: !!user,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
    setPage(0);
  };

  const SortHead = ({ k, label }: { k: SortKey; label: string }) => (
    <TableHead>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sortKey === k && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  const autoFill = useMemo(() => {
    if (!profile) return null;
    return {
      officer: `${profile.last_name}, ${profile.first_name}`,
      rank: profile.ranks?.abbreviation || profile.ranks?.name || "—",
      staff_id: profile.staff_id ?? "—",
      department: profile.departments?.name ?? "—",
      office: profile.office ?? "—",
      shift_group: profile.shift_group ? `Shift ${profile.shift_group}` : "—",
      phone: profile.phone ?? "—",
      email: profile.email ?? "—",
    };
  }, [profile]);

  const canExport = (entry: any) => entry?.submitted_by === user?.id || isReviewer;

  const exportPDF = (entry: any) => {
    if (!canExport(entry)) { toast.error("Access denied: only the submitter or an authorized reviewer can download this form."); return; }
    if (!autoFill) { toast.error("Profile not loaded"); return; }
    const doc = new jsPDF();
    let y = 20;
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("GIS – EXCUSE DUTY FORM", 105, y, { align: "center" }); y += 8;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text("Ghana Immigration Service · HEALTH LAB+", 105, y, { align: "center" }); y += 12;
    const lines: [string, string][] = [
      ["Officer:", autoFill.officer], ["Rank:", autoFill.rank], ["Staff ID:", autoFill.staff_id],
      ["Department:", autoFill.department], ["Office:", autoFill.office], ["Office Shift:", autoFill.shift_group],
      ["Contact:", `${autoFill.phone}${autoFill.email !== "—" ? ` · ${autoFill.email}` : ""}`],
      ["Period:", `${entry.start_date} to ${entry.end_date}`],
      ["Doctor:", entry.doctor_name || "—"], ["Facility:", entry.facility || "—"],
      ["Diagnosis:", entry.diagnosis || "—"], ["Status:", String(entry.status || "SUBMITTED").toUpperCase()],
    ];
    doc.setFontSize(11);
    lines.forEach(([k, v]) => {
      doc.setFont("helvetica", "bold"); doc.text(k, 20, y);
      doc.setFont("helvetica", "normal"); doc.text(String(v), 60, y); y += 7;
    });
    y += 4;
    doc.setFont("helvetica", "bold"); doc.text("Reason / Medical justification:", 20, y); y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(entry.reason || "—", 170), 20, y);
    doc.setFont("helvetica", "italic"); doc.setFontSize(9);
    doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 20, 285);
    doc.save(`excuse_duty_${format(new Date(entry.created_at), "yyyyMMdd")}.pdf`);
  };

  const exportDOCX = async (entry: any) => {
    if (!canExport(entry)) { toast.error("Access denied: only the submitter or an authorized reviewer can download this form."); return; }
    if (!autoFill) { toast.error("Profile not loaded"); return; }
    const kv = (k: string, v: string) => new Paragraph({ children: [new TextRun({ text: k + " ", bold: true }), new TextRun(v || "—")] });
    const docx = new Document({
      sections: [{
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "GIS – EXCUSE DUTY FORM", bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Ghana Immigration Service · HEALTH LAB+")] }),
          new Paragraph({ children: [new TextRun("")] }),
          kv("Officer:", autoFill.officer), kv("Rank:", autoFill.rank), kv("Staff ID:", autoFill.staff_id),
          kv("Department:", autoFill.department), kv("Office:", autoFill.office), kv("Office Shift:", autoFill.shift_group),
          kv("Contact:", `${autoFill.phone}${autoFill.email !== "—" ? ` · ${autoFill.email}` : ""}`),
          kv("Period:", `${entry.start_date} to ${entry.end_date}`),
          kv("Doctor:", entry.doctor_name || "—"), kv("Facility:", entry.facility || "—"),
          kv("Diagnosis:", entry.diagnosis || "—"), kv("Status:", String(entry.status || "SUBMITTED").toUpperCase()),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Reason / Medical justification", bold: true })] }),
          new Paragraph({ children: [new TextRun(entry.reason || "—")] }),
        ],
      }],
    });
    const blob = await Packer.toBlob(docx);
    saveAs(blob, `excuse_duty_${format(new Date(entry.created_at), "yyyyMMdd")}.docx`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Activity}
        title="My Excuse Duty Submissions"
        subtitle="Sortable, paginated history of forms you've submitted to HEALTH LAB+."
      />

      <Card className="border-l-4 border-l-sky-600">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-sky-700" /> Download access</CardTitle>
          <CardDescription className="text-xs">PDF and Word downloads are restricted to the submitting officer and authorized reviewers (Admin, OIC, 2IC, Staff Officer, Supervisor, Head of Administration).</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Submissions</CardTitle>
            <CardDescription className="text-xs">{total} total · page {page + 1} of {totalPages}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <div className="px-6 pb-3 pt-1 border-b grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">From</Label>
            <Input type="date" className="h-8 text-xs" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">To</Label>
            <Input type="date" className="h-8 text-xs" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Search (officer / staff ID)</Label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 text-xs pl-7 pr-7" placeholder="e.g. last name or GIS staff ID" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
              {searchInput && (
                <button onClick={() => setSearchInput("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {(fromDate || toDate || statusFilter !== "all" || search) && (
            <div className="lg:col-span-5 flex justify-end">
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={resetFilters}>
                <X className="h-3 w-3" /> Clear filters
              </Button>
            </div>
          )}
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <SortHead k="created_at" label="Submitted" />
                  <SortHead k="start_date" label="Start" />
                  <SortHead k="end_date" label="End" />
                  <SortHead k="status" label="Status" />
                  <TableHead>Reviewer comment</TableHead>
                  <TableHead className="text-right">Export</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Loading…</TableCell></TableRow>}
                {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">No submissions yet.</TableCell></TableRow>}
                {rows.map((f: any) => (
                  <TableRow key={f.id}>
                    <TableCell className="text-xs">{format(new Date(f.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell className="text-xs">{format(new Date(f.start_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-xs">{format(new Date(f.end_date), "dd MMM yyyy")}</TableCell>
                    <TableCell><Badge className={STATUS_COLOR[f.status] ?? ""}>{f.status}</Badge></TableCell>
                    <TableCell className="text-xs">{f.review_comment ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => exportPDF(f)}><FileDown className="h-3.5 w-3.5" />PDF</Button>
                        <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => exportDOCX(f)}><FileDown className="h-3.5 w-3.5" />Word</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t">
            <div className="text-xs text-muted-foreground">Showing {rows.length === 0 ? 0 : page * pageSize + 1}–{page * pageSize + rows.length} of {total}</div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ChevronLeft className="h-3.5 w-3.5" /> Prev</Button>
              <Button size="sm" variant="outline" className="h-7" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
