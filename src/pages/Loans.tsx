import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContactPhoneInput } from "@/components/ui/contact-phone-input";
import { assertContactPhoneList, formatGhanaPhone } from "@/lib/ghana-phone";
import { formatDateTime } from "@/lib/date-format";

interface LoanRow {
  id: string;
  applicant_name: string;
  phone: string;
  amount: number;
  repayment_months: number;
  purpose: string | null;
  status: string;
  created_at: string;
}

export default function Loans() {
  usePageMeta({
    title: "Loans | Cybernet HRM System",
    description: "Submit and review staff loan applications with validated Ghana telephone contacts.",
  });
  const { user, isAdmin, isAdminOrSupervisor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canReview = isAdmin || isAdminOrSupervisor;

  const [open, setOpen] = useState(false);
  const [applicantName, setApplicantName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [termMonths, setTermMonths] = useState("12");
  const [purpose, setPurpose] = useState("");

  const list = useQuery({
    queryKey: ["loan-applications"],
    queryFn: async (): Promise<LoanRow[]> => {
      const { data, error } = await (supabase as any)
        .from("loan_applications")
        .select("id, applicant_name, phone, amount, repayment_months, purpose, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as LoanRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const canonicalPhone = assertContactPhoneList(phone, "Telephone", true);
      const value = Number(amount);
      const term = Number(termMonths);
      if (!applicantName.trim()) throw new Error("Applicant name is required");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid amount greater than zero");
      if (!Number.isInteger(term) || term < 1 || term > 120) throw new Error("Term must be between 1 and 120 months");
      const { error } = await (supabase as any).from("loan_applications").insert({
        applicant_name: applicantName.trim(),
        phone: canonicalPhone,
        amount: value,
        repayment_months: term,
        purpose: purpose.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Loan application submitted" });
      setOpen(false);
      setApplicantName(""); setPhone(""); setAmount(""); setTermMonths("12"); setPurpose("");
      void queryClient.invalidateQueries({ queryKey: ["loan-applications"] });
    },
    onError: (e: Error) => toast({ title: "Could not submit application", description: e.message, variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("loan_applications").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["loan-applications"] }),
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-secondary">
            <Landmark className="h-6 w-6 text-primary" /> Loans
          </h1>
          <p className="text-sm text-muted-foreground">
            Loan applications with validated Ghana telephone contacts, normalised before storage.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New application</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Loan application</DialogTitle>
              <DialogDescription>Telephone numbers must be genuine Ghana mobile numbers, or a valid international number.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="applicant">Applicant name</Label>
                <Input id="applicant" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loan-phone">Telephone</Label>
                <ContactPhoneInput id="loan-phone" value={phone} onChange={setPhone} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="loan-amount">Amount (GHS)</Label>
                  <Input id="loan-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="term">Term (months)</Label>
                  <Input id="term" type="number" min="1" max="120" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loan-purpose">Purpose</Label>
                <Textarea id="loan-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Loan applications</CardTitle>
          <CardDescription>{list.data?.length ?? 0} record(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Telephone</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Term</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  {canReview && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Loading…</TableCell></TableRow>}
                {!list.isLoading && (list.data?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-muted-foreground">No loan applications yet.</TableCell></TableRow>
                )}
                {(list.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.applicant_name}</TableCell>
                    <TableCell className="font-mono text-xs">{row.phone.startsWith("0") ? formatGhanaPhone(row.phone) : row.phone}</TableCell>
                    <TableCell className="text-right tabular-nums">GHS {Number(row.amount).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.repayment_months} mo</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={row.purpose ?? ""}>{row.purpose ?? "—"}</TableCell>
                    <TableCell><Badge variant={row.status === "approved" ? "default" : row.status === "rejected" ? "destructive" : "outline"}>{row.status}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(row.created_at)}</TableCell>
                    {canReview && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: row.id, status: "approved" })}>Approve</Button>
                          <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: row.id, status: "rejected" })}>Reject</Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
