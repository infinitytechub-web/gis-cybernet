import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date-format";

const db = supabase as any;
const name = (p: any) => (p ? `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() : "—");

/** HRM activity for the staff of one command (profile IDs come from the dashboard's scoped read). */
export function CommandHrmPanel({ profileIds }: { profileIds: string[] }) {
  const { isAdmin, role } = useAuth();
  const qc = useQueryClient();
  const canApprove = isAdmin || role === "head_of_administration";
  const canRecommend = isAdmin || role === "oic" || role === "2ic";
  const ids = profileIds.slice(0, 1000);
  const key = ["command-hrm", ids.length, ids[0]];

  const { data } = useQuery({
    queryKey: key,
    enabled: ids.length > 0,
    queryFn: async () => {
      const sel = "*, profiles(id,first_name,last_name,staff_id)";
      const [a, p, e, t] = await Promise.all([
        db.from("staff_appointments").select(sel).in("profile_id", ids).order("created_at", { ascending: false }).limit(10),
        db.from("staff_promotions").select(`${sel}, to_rank:ranks!staff_promotions_to_rank_id_fkey(name)`).in("profile_id", ids).order("created_at", { ascending: false }).limit(10),
        db.from("staff_exits").select(sel).in("profile_id", ids).order("created_at", { ascending: false }).limit(10),
        db.from("staff_transfer_requests").select(`${sel}, to_unit:org_units!staff_transfer_requests_to_org_unit_id_fkey(name)`).in("profile_id", ids).in("status", ["pending", "recommended"]).order("created_at"),
      ]);
      return { a: a.data ?? [], p: p.data ?? [], e: e.data ?? [], t: t.data ?? [] };
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`command-hrm-${Math.random().toString(36).slice(2)}`);
    for (const t of ["staff_appointments", "staff_promotions", "staff_exits", "staff_transfer_requests"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => qc.invalidateQueries({ queryKey: ["command-hrm"] }));
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const act = async (fn: string, id: string, yes: boolean) => {
    const args = fn === "recommend_staff_transfer" ? { _id: id, _recommend: yes } : { _id: id, _approve: yes };
    const { error } = await db.rpc(fn, args);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["command-hrm"] });
  };

  const recent = [
    ...(data?.a ?? []).map((r: any) => ({ id: r.id, at: r.created_at, who: r.profiles, label: `Appointed ${r.position_title}`, status: null })),
    ...(data?.p ?? []).map((r: any) => ({ id: r.id, at: r.created_at, who: r.profiles, label: `Promotion to ${r.to_rank?.name}`, status: r.status })),
    ...(data?.e ?? []).map((r: any) => ({ id: r.id, at: r.created_at, who: r.profiles, label: `${r.exit_type} effective ${formatDate(r.effective_date)}`, status: r.status })),
  ].sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 12);

  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = (rows: any[]) => rows.filter((r) => String(r.created_at).startsWith(month)).length;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Briefcase className="h-4 w-4" aria-hidden="true" /> HRM — appointments, promotions, exits & transfers</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
          {[["Appointments this month", thisMonth(data?.a ?? [])], ["Promotions this month", thisMonth(data?.p ?? [])], ["Pending exits", (data?.e ?? []).filter((r: any) => r.status === "pending").length], ["Open transfer requests", data?.t.length ?? 0]].map(([l, v]) => (
            <div key={l as string} className="rounded-md border p-2"><p className="text-xl font-bold text-primary">{v as number}</p><p className="text-xs text-muted-foreground">{l as string}</p></div>
          ))}
        </div>
        {(data?.t.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Transfer applications</p>
            {data!.t.map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div><Link className="font-medium underline-offset-2 hover:underline" to={`/staff/${r.profile_id}?tab=service`}>{name(r.profiles)}</Link> → {r.to_unit?.name}<p className="text-xs text-muted-foreground">{r.reason}</p></div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">{r.status === "pending" ? "Awaiting recommendation" : "Recommended"}</Badge>
                  {r.status === "pending" && canRecommend && (<><Button size="sm" onClick={() => act("recommend_staff_transfer", r.id, true)}>Recommend</Button><Button size="sm" variant="outline" onClick={() => act("recommend_staff_transfer", r.id, false)}>Reject</Button></>)}
                  {r.status === "recommended" && canApprove && (<><Button size="sm" onClick={() => act("decide_staff_transfer", r.id, true)}>Approve</Button><Button size="sm" variant="outline" onClick={() => act("decide_staff_transfer", r.id, false)}>Reject</Button></>)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div>
          <p className="mb-1 text-sm font-semibold">Recent activity</p>
          {recent.length === 0 ? <p className="text-sm text-muted-foreground">No HRM entries for this command yet.</p> : (
            <ul className="divide-y text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span><Link className="font-medium underline-offset-2 hover:underline" to={`/staff/${r.who?.id}?tab=service`}>{name(r.who)}</Link> — <span className="capitalize">{r.label}</span></span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">{r.status && <Badge variant="outline" className="capitalize">{r.status}</Badge>}{formatDate(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
