import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OnDutyNowPanel } from "@/components/roster/OnDutyNowPanel";
import { LeaveApprovalQueue } from "@/components/leave/LeaveApprovalQueue";
import { CommandApprovalQueue } from "@/components/hr/CommandApprovalQueue";
import { useProcurementBudgets } from "@/hooks/useProcurementRequests";

const money = (n: number, c: string) => `${c} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function CommandHeadPortal() {
  const ctx = useQuery({
    queryKey: ["my-command-context"],
    queryFn: async () => { const { data, error } = await supabase.rpc("my_command_context"); if (error) throw error; return (data as any[])?.[0] ?? null; },
  });
  const budgets = useProcurementBudgets(new Date().getFullYear());
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div><h1 className="text-2xl font-bold">My Command</h1>
        <p className="text-sm text-muted-foreground">{ctx.data?.unit_name ? `${ctx.data.unit_name} — ` : ""}duty roster, leave, budgets and pending approvals for your command.</p></div>
      <Tabs defaultValue="approvals">
        <TabsList className="flex-wrap"><TabsTrigger value="approvals">Pending approvals</TabsTrigger><TabsTrigger value="leave">Leave</TabsTrigger><TabsTrigger value="roster">Duty roster</TabsTrigger><TabsTrigger value="budgets">Budgets</TabsTrigger></TabsList>
        <TabsContent value="approvals"><CommandApprovalQueue /></TabsContent>
        <TabsContent value="leave"><LeaveApprovalQueue /></TabsContent>
        <TabsContent value="roster"><OnDutyNowPanel /></TabsContent>
        <TabsContent value="budgets">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" />Budgets {new Date().getFullYear()}</CardTitle></CardHeader>
            <CardContent>
              {budgets.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (budgets.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No budget set for your command this year.</p> :
              <div className="overflow-x-auto"><Table className="min-w-[700px]">
                <TableHeader><TableRow><TableHead>Command</TableHead><TableHead>Budget</TableHead><TableHead>Committed</TableHead><TableHead>Pending</TableHead><TableHead>Remaining</TableHead><TableHead>Used</TableHead></TableRow></TableHeader>
                <TableBody>{(budgets.data ?? []).map((b) => (
                  <TableRow key={b.org_unit_id}><TableCell className="font-medium">{b.org_unit_name}</TableCell>
                    <TableCell>{money(b.budget_amount, b.currency)}</TableCell><TableCell>{money(b.committed, b.currency)}</TableCell>
                    <TableCell>{money(b.pending, b.currency)}</TableCell><TableCell>{money(b.remaining, b.currency)}</TableCell>
                    <TableCell><Badge variant={b.over_budget ? "destructive" : "outline"}>{b.utilisation_pct == null ? "—" : `${Math.round(b.utilisation_pct)}%`}</Badge></TableCell></TableRow>))}</TableBody></Table></div>}
              <Link to="/procurement" className="mt-3 inline-block text-sm text-primary underline">Open Procurement to approve requisitions</Link>
            </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
