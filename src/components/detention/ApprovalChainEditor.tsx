import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Constants } from "@/integrations/supabase/types";
import { roleLabel } from "@/lib/role-labels";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/date-format";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Save, RotateCcw, Loader2 } from "lucide-react";

type Tier = { id: string; workflow: string; tier: number; label: string; role: string; configured_at: string | null };
const EMPTY_TIERS: Tier[] = [];

/** Admin-only: choose who signs at each of the 3 approval tiers for bail and repatriation. */
export function ApprovalChainEditor() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, loading } = useAuth();
  const { data = EMPTY_TIERS, isPending, error, refetch } = useQuery({ queryKey: ["chain_all"], enabled: isAdmin, queryFn: async () => {
    const result = await supabase.from("approval_chain_config").select("*").order("workflow").order("tier");
    if (result.error) throw result.error;
    return (result.data ?? []) as Tier[];
  } });
  const [rows, setRows] = useState<Tier[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => setRows(data), [data]);
  const complete = ["bail", "repatriation"].every((w) => [1, 2, 3].every((tier) => rows.filter((r) => r.workflow === w && r.tier === tier).length === 1)) && rows.length === 6;
  const valid = complete && rows.every((r) => r.label.trim().length > 0 && r.label.trim().length <= 100 && Constants.public.Enums.app_role.some((role) => role === r.role));
  const latest = rows.flatMap((r) => r.configured_at ? [r.configured_at] : []).sort().at(-1);
  const save = async () => {
    if (!isAdmin || !valid || error || saving) return;
    setSaving(true);
    try {
      const result = await supabase.rpc("save_approval_chain", { _tiers: rows.map((r) => ({ id: r.id, label: r.label.trim(), role: r.role })) });
      if (result.error) throw result.error;
      toast({ title: "Signing authority saved" });
      await Promise.all([qc.invalidateQueries({ queryKey: ["chain_all"] }), qc.invalidateQueries({ queryKey: ["chain"] })]);
    } catch (e) {
      toast({ title: "Not saved", description: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "Please try again"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <p role="status">Loading administrator access…</p>;
  if (!isAdmin) return <Alert variant="destructive"><AlertDescription>Only Super Admins may change signing authority.</AlertDescription></Alert>;
  return (
    <section aria-label="Approval signing authority" className="space-y-6">
        <h2 className="text-xl font-semibold">Approval signing authority</h2>
        {isPending ? <p role="status">Loading approval tiers…</p> : error || !complete ? (
          <Alert variant="destructive"><AlertDescription>Could not load all six approval tiers. Saving is blocked.<Button variant="outline" className="ml-2" onClick={() => refetch()}>Retry</Button></AlertDescription></Alert>
        ) : null}
        {rows.some((r) => !r.configured_at) ? (
          <Alert variant="destructive"><AlertDescription>Not confirmed yet. The roles below are suggestions only — bail and repatriation sign-offs are blocked until a Super Admin reviews and saves them.</AlertDescription></Alert>
        ) : latest && (
          <Alert><AlertDescription>Confirmed {formatDateTime(latest)}.</AlertDescription></Alert>
        )}
        {["bail", "repatriation"].map((w) => (
          <div key={w} className="space-y-4 border-t pt-4">
            <h3 className="font-semibold capitalize">{w}</h3>
            {rows.filter((r) => r.workflow === w).map((r) => (
              <div key={r.id} className="grid items-start gap-3 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]">
                <span className="text-sm font-medium md:pt-7">Tier {r.tier} · {r.tier === 3 ? "Final decision" : "Recommendation"}</span>
                <div className="min-w-0 space-y-1.5"><Label htmlFor={`label-${r.id}`}>Step name</Label>
                <Input id={`label-${r.id}`} disabled={saving} maxLength={100} value={r.label} onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, label: e.target.value } : x))} /></div>
                <div className="min-w-0 space-y-1.5"><Label htmlFor={`role-${r.id}`}>Authorized signing role</Label>
                <Select disabled={saving} value={r.role} onValueChange={(v) => setRows(rows.map((x) => x.id === r.id ? { ...x, role: v } : x))}>
                  <SelectTrigger id={`role-${r.id}`} aria-label={`${w} tier ${r.tier} signing role`} className="h-auto min-h-10 [&>span]:whitespace-normal [&>span]:text-left"><SelectValue /></SelectTrigger>
                  <SelectContent>{Constants.public.Enums.app_role.map((ro) => <SelectItem key={ro} value={ro}>{ro === "admin" ? "Super Admin" : roleLabel(ro)}</SelectItem>)}</SelectContent>
                </Select></div>
              </div>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button disabled={isPending || !!error || !valid || saving} onClick={save}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save signing authority</Button>
          <Button variant="outline" disabled={saving || isPending} onClick={() => setRows(data)}><RotateCcw className="mr-2 h-4 w-4" />Discard changes</Button>
        </div>
    </section>
  );
}
