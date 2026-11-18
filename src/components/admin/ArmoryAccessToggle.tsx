import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const db = supabase as any;

export function ArmoryAccessToggle({ profileId, capability = "armory-weapons", label = "Armory & Weapons access", note }: { profileId: string; capability?: "armory-weapons" | "armory-weapon-register"; label?: string; note?: string }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const state = useQuery({
    queryKey: ["armory-access", profileId, capability],
    queryFn: async () => {
      const { data, error } = await db.rpc("officer_capability_state", { _profile_id: profileId, _capability: capability });
      if (error) throw error;
      return data as { has_account: boolean; granted: boolean; built_in?: boolean; granted_by_name?: string; granted_at?: string };
    },
  });
  const s = state.data;
  const shown = pending ?? !!s?.granted;

  const confirm = async () => {
    if (pending === null) return;
    if (reason.trim().length < 3) { toast.error("Enter a reason"); return; }
    setBusy(true);
    try {
      const { error } = await db.rpc("set_officer_capability", { _profile_id: profileId, _capability: capability, _grant: pending, _reason: reason.trim() });
      if (error) throw error;
      toast.success(pending ? `${label} granted` : `${label} revoked`);
      setPending(null); setReason("");
      qc.invalidateQueries({ queryKey: ["armory-access", profileId, capability] });
      qc.invalidateQueries({ queryKey: ["command-tier-grants"] });
    } catch (e: any) { toast.error(e.message ?? "Could not change access"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor={`armory-${capability}-${profileId}`}>{label}</Label>
          <p className="text-xs text-muted-foreground">
            {state.isLoading ? "Loading…" : state.isError ? "Access status could not be loaded."
              : !s?.has_account ? "This officer has no sign-in account."
              : s.granted ? `Granted${s.granted_by_name ? ` by ${s.granted_by_name}` : ""}` : "Not granted"}
            {s?.built_in ? " · Already has access through their command role." : ""}
            {note ? <span className="block">{note}</span> : null}
          </p>
        </div>
        <Switch id={`armory-${capability}-${profileId}`} checked={shown} disabled={!s?.has_account || busy || state.isError}
          onCheckedChange={(v) => setPending(v === !!s?.granted ? null : v)} />
      </div>
      {pending !== null && (
        <div className="space-y-2">
          <Label htmlFor={`armory-reason-${capability}-${profileId}`}>Reason for {pending ? "granting" : "revoking"}</Label>
          <Textarea id={`armory-reason-${capability}-${profileId}`} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={confirm} disabled={busy}>{busy ? "Saving…" : pending ? "Grant access" : "Revoke access"}</Button>
            <Button size="sm" variant="outline" onClick={() => { setPending(null); setReason(""); }} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
