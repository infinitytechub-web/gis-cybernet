import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Constants } from "@/integrations/supabase/types";
import { roleLabel } from "@/lib/role-labels";
import { useToast } from "@/hooks/use-toast";

type Tier = { id: string; workflow: string; tier: number; label: string; role: string };

/** Admin-only: choose who signs at each of the 3 approval tiers for bail and repatriation. */
export function ApprovalChainEditor() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data = [] } = useQuery({ queryKey: ["chain_all"], queryFn: async () =>
    ((await supabase.from("approval_chain_config").select("*").order("workflow").order("tier")).data ?? []) as Tier[] });
  const [rows, setRows] = useState<Tier[]>([]);
  useEffect(() => setRows(data), [data]);
  const save = async () => {
    for (const r of rows) {
      const { error } = await supabase.from("approval_chain_config").update({ label: r.label, role: r.role as never }).eq("id", r.id);
      if (error) return toast({ title: "Not saved", description: error.message, variant: "destructive" });
    }
    toast({ title: "Chain of command saved" });
    qc.invalidateQueries({ queryKey: ["chain_all"] }); qc.invalidateQueries({ queryKey: ["chain"] });
  };
  return (
    <Card>
      <CardHeader><CardTitle>3-tier chain of command</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Tiers 1 and 2 recommend; tier 3 (the Command) makes the final decision.</p>
        {["bail", "repatriation"].map((w) => (
          <div key={w} className="space-y-2">
            <h3 className="font-semibold capitalize">{w}</h3>
            {rows.filter((r) => r.workflow === w).map((r) => (
              <div key={r.id} className="grid items-center gap-2 sm:grid-cols-[80px_1fr_1fr]">
                <span className="text-sm">Tier {r.tier}</span>
                <Input value={r.label} onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, label: e.target.value } : x))} />
                <Select value={r.role} onValueChange={(v) => setRows(rows.map((x) => x.id === r.id ? { ...x, role: v } : x))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Constants.public.Enums.app_role.map((ro) => <SelectItem key={ro} value={ro}>{roleLabel(ro)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </div>
        ))}
        <Button onClick={save}>Save</Button>
      </CardContent>
    </Card>
  );
}
