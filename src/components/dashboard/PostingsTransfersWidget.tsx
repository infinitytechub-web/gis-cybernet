import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRightLeft, Download, Printer, Pencil, Trash2, Search, FileText, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { timeUntilRetirement, yearsOfService } from "@/lib/postings-analytics";
import { exportReport } from "@/lib/export-utils";

import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar } from "@/components/shared/BulkActionBar";

interface Row {
  id: string;
  staffId: string;
  name: string;
  dateJoined: string | null;
  stations: string;
  phone: string;
  dob: string | null;
  appointment: string;
  yearsService: string;
  retirement: string;
  retirementAge: number;
}

function formatRetirement(dob: string | null, retirementAge: number): string {
  const r = timeUntilRetirement(dob, retirementAge);
  if (!dob) return "—";
  if (r.retired) return "Retired";
  return `${r.years}y ${r.months}m ${r.days}d`;
}

function formatYearsService(dateJoined: string | null): string {
  if (!dateJoined) return "—";
  const t = yearsOfService(dateJoined);
  return `${t.years}y ${t.months}m`;
}

export default function PostingsTransfersWidget() {
  const { isAdminOrSupervisor, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["postings-transfers-widget"],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, phone, date_of_birth, date_joined_service, current_appointment, retirement_age, departments(name)")
        .order("last_name");
      if (error) throw error;

      const ids = (profiles ?? []).map((p: any) => p.id);
      let postingsByProfile: Record<string, string[]> = {};
      if (ids.length) {
        const { data: postings } = await supabase
          .from("postings_transfers")
          .select("profile_id, to_department:departments!postings_transfers_to_department_id_fkey(name)")
          .in("profile_id", ids)
          .eq("status", "approved")
          .order("effective_date", { ascending: true });
        (postings ?? []).forEach((p: any) => {
          const name = p.to_department?.name;
          if (!name) return;
          (postingsByProfile[p.profile_id] ||= []).push(name);
        });
      }

      return (profiles ?? []).map((p: any): Row => {
        const stationsList = postingsByProfile[p.id] ?? [];
        const current = p.departments?.name ?? "—";
        const allStations = Array.from(new Set([...stationsList, current])).filter((s) => s && s !== "—");
        return {
          id: p.id,
          staffId: p.staff_id ?? "—",
          name: `${p.last_name ?? ""}, ${p.first_name ?? ""}`.trim(),
          dateJoined: p.date_joined_service,
          stations: allStations.length ? allStations.join(" → ") : current,
          phone: p.phone ?? "—",
          dob: p.date_of_birth,
          appointment: p.current_appointment ?? "—",
          yearsService: formatYearsService(p.date_joined_service),
          retirement: formatRetirement(p.date_of_birth, p.retirement_age ?? 60),
          retirementAge: p.retirement_age ?? 60,
        };
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profiles").update({ status: "inactive" as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["postings-transfers-widget"] });
      toast.success("Staff record archived");
    },
    onError: (e: any) => toast.error(e.message || "Failed to archive"),
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("profiles").update({ status: "inactive" as any }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["postings-transfers-widget"] });
      toast.success(`${n} staff record${n === 1 ? "" : "s"} archived`);
      bulk.clear();
    },
    onError: (e: any) => toast.error(e.message || "Bulk archive failed"),
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) =>
      r.staffId.toLowerCase().includes(needle) ||
      r.name.toLowerCase().includes(needle) ||
      r.stations.toLowerCase().includes(needle) ||
      r.appointment.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const bulk = useBulkSelection(filtered);

  if (!isAdminOrSupervisor) return null;

  const headers = ["Staff ID", "Name", "Date Joined", "Station(s)", "Phone", "DOB", "Appointment", "Years in Service", "Time Until Retirement"];
  const exportRows = filtered.map((r) => [
    r.staffId, r.name,
    r.dateJoined ? format(new Date(r.dateJoined), "dd MMM yyyy") : "—",
    r.stations, r.phone,
    r.dob ? format(new Date(r.dob), "dd MMM yyyy") : "—",
    r.appointment, r.yearsService, r.retirement,
  ]);

  const doExport = (fmt: "pdf" | "csv" | "excel" | "word") => {
    exportReport(fmt, {
      title: "Staff Transfer & Postings Register",
      filename: `postings-transfers-${format(new Date(), "yyyy-MM-dd")}`,
      headers,
      rows: exportRows,
      subtitle: `${filtered.length} staff records · Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`,
    });
  };

  const doPrint = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const style = `body{font-family:system-ui;padding:24px}h1{font-size:18px;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f5f5f5}`;
    w.document.write(`<html><head><title>Postings & Transfers</title><style>${style}</style></head><body><h1>Staff Transfer & Postings Register</h1><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${exportRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <ArrowRightLeft className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          Staff Transfers & Postings
          <span className="text-xs font-normal text-muted-foreground">({filtered.length})</span>
          <div className="ml-auto flex flex-wrap gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => doExport("csv")}><Download className="h-3 w-3" />CSV</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => doExport("excel")}><FileSpreadsheet className="h-3 w-3" />XLSX</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => doExport("pdf")}><FileText className="h-3 w-3" />PDF</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => doExport("word")}><FileText className="h-3 w-3" />DOCX</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={doPrint}><Printer className="h-3 w-3" />Print</Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search staff ID, name, station, appointment…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-9" />
        </div>
        <div className="overflow-auto max-h-[280px] border rounded-md">
          <Table className="min-w-[900px]">
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {headers.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
                <TableHead className="text-xs w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">No records.</TableCell></TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-mono">{r.staffId}</TableCell>
                    <TableCell className="text-xs font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs">{r.dateJoined ? format(new Date(r.dateJoined), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell className="text-xs">{r.stations}</TableCell>
                    <TableCell className="text-xs">{r.phone}</TableCell>
                    <TableCell className="text-xs">{r.dob ? format(new Date(r.dob), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell className="text-xs">{r.appointment}</TableCell>
                    <TableCell className="text-xs">{r.yearsService}</TableCell>
                    <TableCell className="text-xs">{r.retirement}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit" onClick={() => navigate(`/staff/${r.id}`)}><Pencil className="h-3 w-3" /></Button>
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" title="Delete"><Trash2 className="h-3 w-3" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Archive {r.name}?</AlertDialogTitle>
                                <AlertDialogDescription>This will soft-delete the staff record. It can be restored from the Recycle Bin.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(r.id)}>Archive</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground pt-2">
          Showing {filtered.length} record{filtered.length === 1 ? "" : "s"} · scroll within the table to view all · use search to narrow down.
          {" · "}Data as of: {dataUpdatedAt ? format(new Date(dataUpdatedAt), "dd MMM yyyy HH:mm:ss") : "—"}
          {" · "}
          <button className="underline" onClick={() => navigate("/postings/history")}>Open full transfer history →</button>
        </p>
      </CardContent>
    </Card>
  );
}

