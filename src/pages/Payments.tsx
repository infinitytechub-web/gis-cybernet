import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, Loader2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContactPhoneInput } from "@/components/ui/contact-phone-input";
import { assertContactPhoneList, formatGhanaPhone } from "@/lib/ghana-phone";
import { formatDateTime } from "@/lib/date-format";

interface PaymentRow {
  id: string;
  payer_name: string;
  phone: string;
  amount: number;
  method: string;
  reference: string | null;
  purpose: string | null;
  status: string;
  created_at: string;
}

const METHODS = [
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
];

export default function Payments() {
  usePageMeta({
    title: "Payments | Cybernet HRM System",
    description: "Record and track payment requests with validated Ghana telephone contacts.",
  });
  const { user, isAdmin, isAdminOrSupervisor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canReview = isAdmin || isAdminOrSupervisor;

  const [open, setOpen] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("mobile_money");
  const [reference, setReference] = useState("");
  const [purpose, setPurpose] = useState("");

  const list = useQuery({
    queryKey: ["payment-requests"],
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await (supabase as any)
        .from("payment_requests")
        .select("id, payer_name, phone, amount, method, reference, purpose, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      // Central validator — the same rules the backend trigger enforces.
      const canonicalPhone = assertContactPhoneList(phone, "Telephone", true);
      const value = Number(amount);
      if (!payerName.trim()) throw new Error("Payer name is required");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid amount greater than zero");
      const { error } = await (supabase as any).from("payment_requests").insert({
        payer_name: payerName.trim(),
        phone: canonicalPhone,
        amount: value,
        method,
        reference: reference.trim() || null,
        purpose: purpose.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Payment recorded" });
      setOpen(false);
      setPayerName(""); setPhone(""); setAmount(""); setReference(""); setPurpose("");
      void queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
    },
    onError: (e: Error) => toast({ title: "Could not save payment", description: e.message, variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("payment_requests").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["payment-requests"] }),
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-secondary">
            <CreditCard className="h-6 w-6 text-primary" /> Payments
          </h1>
          <p className="text-sm text-muted-foreground">
            Payment requests with validated Ghana telephone contacts. Numbers are normalised before storage.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New payment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record a payment</DialogTitle>
              <DialogDescription>Telephone numbers must be genuine Ghana mobile numbers, or a valid international number.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="payer">Payer name</Label>
                <Input id="payer" value={payerName} onChange={(e) => setPayerName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-phone">Telephone</Label>
                <ContactPhoneInput id="pay-phone" value={phone} onChange={setPhone} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Amount (GHS)</Label>
                  <Input id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={64} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purpose">Purpose</Label>
                <Textarea id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment requests</CardTitle>
          <CardDescription>{list.data?.length ?? 0} record(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Payer</TableHead>
                  <TableHead>Telephone</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recorded</TableHead>
                  {canReview && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Loading…</TableCell></TableRow>}
                {!list.isLoading && (list.data?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-muted-foreground">No payments recorded yet.</TableCell></TableRow>
                )}
                {(list.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.payer_name}</TableCell>
                    <TableCell className="font-mono text-xs">{row.phone.startsWith("0") ? formatGhanaPhone(row.phone) : row.phone}</TableCell>
                    <TableCell className="text-right tabular-nums">GHS {Number(row.amount).toFixed(2)}</TableCell>
                    <TableCell>{METHODS.find((m) => m.value === row.method)?.label ?? row.method}</TableCell>
                    <TableCell>{row.reference ?? "—"}</TableCell>
                    <TableCell><Badge variant={row.status === "paid" ? "default" : row.status === "rejected" ? "destructive" : "outline"}>{row.status}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(row.created_at)}</TableCell>
                    {canReview && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: row.id, status: "paid" })}>Mark paid</Button>
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
