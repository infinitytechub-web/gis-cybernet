import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, FileHeart, CalendarClock, Pill, FilePlus2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function HealthLabWidget() {
  const { data } = useQuery({
    queryKey: ["health-lab-widget"],
    queryFn: async () => {
      const [recCount, apptCount, pendExcuse, inv] = await Promise.all([
        supabase.from("medical_records" as any).select("id", { count: "exact", head: true }),
        supabase.from("medical_appointments" as any).select("id", { count: "exact", head: true }).eq("status", "scheduled"),
        supabase.from("excuse_duty_forms" as any).select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("medical_inventory" as any).select("quantity, reorder_threshold"),
      ]);
      const lowStock = (inv.data ?? []).filter((i: any) => (i.quantity ?? 0) <= (i.reorder_threshold ?? 0)).length;
      return {
        records: recCount.count ?? 0,
        scheduled: apptCount.count ?? 0,
        pendingExcuse: pendExcuse.count ?? 0,
        lowStock,
      };
    },
    refetchInterval: 60_000,
  });

  return (
    <Card className="border-l-4 border-l-emerald-700">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-emerald-700" /> HEALTH LAB+
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-md border p-2"><FileHeart className="h-4 w-4 text-emerald-600" /><div><div className="font-bold text-sm">{data?.records ?? "—"}</div><div className="text-muted-foreground text-[10px]">Records</div></div></div>
          <div className="flex items-center gap-2 rounded-md border p-2"><CalendarClock className="h-4 w-4 text-sky-600" /><div><div className="font-bold text-sm">{data?.scheduled ?? "—"}</div><div className="text-muted-foreground text-[10px]">Scheduled</div></div></div>
          <div className="flex items-center gap-2 rounded-md border p-2"><FilePlus2 className="h-4 w-4 text-amber-600" /><div><div className="font-bold text-sm">{data?.pendingExcuse ?? "—"}</div><div className="text-muted-foreground text-[10px]">Pending Excuse</div></div></div>
          <div className="flex items-center gap-2 rounded-md border p-2"><Pill className="h-4 w-4 text-rose-600" /><div><div className="font-bold text-sm">{data?.lowStock ?? "—"}</div><div className="text-muted-foreground text-[10px]">Low stock</div></div></div>
        </div>
        <Button asChild size="sm" variant="outline" className="w-full"><Link to="/health-lab">Open Health Lab</Link></Button>
      </CardContent>
    </Card>
  );
}
