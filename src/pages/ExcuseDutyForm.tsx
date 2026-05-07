import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilePlus2, FileDown, FileText, Activity, UserCheck } from "lucide-react";
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

export default function ExcuseDutyForm() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
    reason: "",
    diagnosis: "",
    doctor_name: "",
    facility: "",
  });

  // Auto-fill: rank, department, office shift, staff ID, contact
  const { data: profile } = useQuery({
    queryKey: ["my-profile-excuse"],
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

  const autoFill = useMemo(() => {
    if (!profile) return null;
    const rank = profile.ranks?.abbreviation || profile.ranks?.name || "—";
    return {
      officer: `${profile.last_name}, ${profile.first_name}`,
      rank,
      staff_id: profile.staff_id ?? "—",
      department: profile.departments?.name ?? "—",
      office: profile.office ?? "—",
      shift_group: profile.shift_group ? `Shift ${profile.shift_group}` : "—",
      phone: profile.phone ?? "—",
      email: profile.email ?? "—",
    };
  }, [profile]);

  const { data: myForms = [] } = useQuery({
    queryKey: ["my-excuse-forms", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("excuse_duty_forms" as any).select("*").eq("submitted_by", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("Profile not found");
      if (!form.reason.trim()) throw new Error("Reason is required");
      const { error } = await supabase.from("excuse_duty_forms" as any).insert({
        staff_profile_id: profile.id,
        submitted_by: user!.id,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason.trim(),
        diagnosis: form.diagnosis || null,
        doctor_name: form.doctor_name || null,
        facility: form.facility || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-excuse-forms"] });
      toast.success("Excuse Duty Form submitted — reviewers have been notified.");
      setForm({ ...form, reason: "", diagnosis: "", doctor_name: "", facility: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportPDF = (entry?: any) => {
    if (!autoFill) { toast.error("Profile not loaded"); return; }
    const data = entry ?? { ...form, status: "DRAFT", created_at: new Date().toISOString() };
    const doc = new jsPDF();
    let y = 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("GIS – EXCUSE DUTY FORM", 105, y, { align: "center" });
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Ghana Immigration Service · HEALTH LAB+", 105, y, { align: "center" });
    y += 12;
    const lines: [string, string][] = [
      ["Officer:", autoFill.officer],
      ["Rank:", autoFill.rank],
      ["Staff ID:", autoFill.staff_id],
      ["Department:", autoFill.department],
      ["Office:", autoFill.office],
      ["Office Shift:", autoFill.shift_group],
      ["Contact:", `${autoFill.phone}${autoFill.email !== "—" ? ` · ${autoFill.email}` : ""}`],
      ["Period:", `${data.start_date} to ${data.end_date}`],
      ["Doctor:", data.doctor_name || "—"],
      ["Facility:", data.facility || "—"],
      ["Diagnosis:", data.diagnosis || "—"],
      ["Status:", (data.status || "SUBMITTED").toUpperCase()],
    ];
    doc.setFontSize(11);
    lines.forEach(([k, v]) => {
      doc.setFont("helvetica", "bold"); doc.text(k, 20, y);
      doc.setFont("helvetica", "normal"); doc.text(String(v), 60, y);
      y += 7;
    });
    y += 4;
    doc.setFont("helvetica", "bold"); doc.text("Reason / Medical justification:", 20, y); y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(data.reason || "—", 170), 20, y);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 20, 285);
    doc.save(`excuse_duty_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
  };

  const exportDOCX = async (entry?: any) => {
    if (!autoFill) { toast.error("Profile not loaded"); return; }
    const data = entry ?? { ...form, status: "DRAFT", created_at: new Date().toISOString() };
    const heading = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] });
    const kv = (k: string, v: string) => new Paragraph({ children: [new TextRun({ text: k + " ", bold: true }), new TextRun(v || "—")] });
    const docx = new Document({
      sections: [{
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "GIS – EXCUSE DUTY FORM", bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Ghana Immigration Service · HEALTH LAB+")] }),
          new Paragraph({ children: [new TextRun("")] }),
          kv("Officer:", autoFill.officer),
          kv("Rank:", autoFill.rank),
          kv("Staff ID:", autoFill.staff_id),
          kv("Department:", autoFill.department),
          kv("Office:", autoFill.office),
          kv("Office Shift:", autoFill.shift_group),
          kv("Contact:", `${autoFill.phone}${autoFill.email !== "—" ? ` · ${autoFill.email}` : ""}`),
          kv("Period:", `${data.start_date} to ${data.end_date}`),
          kv("Doctor:", data.doctor_name || "—"),
          kv("Facility:", data.facility || "—"),
          kv("Diagnosis:", data.diagnosis || "—"),
          kv("Status:", (data.status || "SUBMITTED").toUpperCase()),
          new Paragraph({ children: [new TextRun("")] }),
          heading("Reason / Medical justification"),
          new Paragraph({ children: [new TextRun(data.reason || "—")] }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({ children: [new TextRun({ text: `Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, italics: true, size: 18 })] }),
        ],
      }],
    });
    const blob = await Packer.toBlob(docx);
    saveAs(blob, `excuse_duty_${format(new Date(), "yyyyMMdd_HHmm")}.docx`);
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-emerald-700/20 bg-gradient-to-r from-emerald-900 via-emerald-700 to-teal-600 p-5 shadow-md">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="rounded-lg bg-white/15 backdrop-blur p-2.5 ring-1 ring-white/20">
            <Activity className="h-7 w-7 text-white" />
          </div>
          <div className="text-white">
            <h1 className="text-2xl font-bold tracking-tight">Excuse Duty Form</h1>
            <p className="text-xs text-white/80">Submit and download standard Excuse Duty Forms (PDF & Word)</p>
          </div>
        </div>
      </div>

      {autoFill && (
        <Card className="border-l-4 border-l-emerald-600">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><UserCheck className="h-4 w-4 text-emerald-700" /> Auto-filled from your profile</CardTitle>
            <CardDescription className="text-xs">These details are pulled automatically and printed on every export.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
              <div><div className="text-muted-foreground">Officer</div><div className="font-medium">{autoFill.officer}</div></div>
              <div><div className="text-muted-foreground">Rank</div><div className="font-medium">{autoFill.rank}</div></div>
              <div><div className="text-muted-foreground">Staff ID</div><div className="font-medium">{autoFill.staff_id}</div></div>
              <div><div className="text-muted-foreground">Department</div><div className="font-medium">{autoFill.department}</div></div>
              <div><div className="text-muted-foreground">Office</div><div className="font-medium">{autoFill.office}</div></div>
              <div><div className="text-muted-foreground">Office Shift</div><div className="font-medium">{autoFill.shift_group}</div></div>
              <div className="md:col-span-2"><div className="text-muted-foreground">Contact</div><div className="font-medium">{autoFill.phone}{autoFill.email !== "—" ? ` · ${autoFill.email}` : ""}</div></div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> New submission</CardTitle><CardDescription className="text-xs">Forms route to HEALTH LAB+ reviewers (Submitted → Reviewed → Approved/Rejected).</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Start date *</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><Label>End date *</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div><Label>Doctor name</Label><Input value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} /></div>
            <div><Label>Facility</Label><Input value={form.facility} onChange={(e) => setForm({ ...form, facility: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Diagnosis</Label><Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Reason / Medical justification *</Label><Textarea rows={4} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="gap-1"><FilePlus2 className="h-4 w-4" /> Submit</Button>
            <Button variant="outline" onClick={() => exportPDF()} className="gap-1"><FileDown className="h-4 w-4" /> Export PDF</Button>
            <Button variant="outline" onClick={() => exportDOCX()} className="gap-1"><FileDown className="h-4 w-4" /> Export Word</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">My submissions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Reviewer comment</TableHead><TableHead className="text-right">Export</TableHead></TableRow></TableHeader>
            <TableBody>
              {myForms.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No submissions yet.</TableCell></TableRow>}
              {myForms.map((f: any) => (
                <TableRow key={f.id}>
                  <TableCell className="text-xs">{format(new Date(f.created_at), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-xs">{format(new Date(f.start_date), "dd MMM")} – {format(new Date(f.end_date), "dd MMM yyyy")}</TableCell>
                  <TableCell><Badge className={STATUS_COLOR[f.status] ?? ""}>{f.status}</Badge></TableCell>
                  <TableCell className="text-xs">{f.review_comment ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => exportPDF(f)}>PDF</Button>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => exportDOCX(f)}>Word</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
