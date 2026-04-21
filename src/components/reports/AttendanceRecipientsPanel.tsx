import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mail, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Period = "weekly" | "monthly";

export default function AttendanceRecipientsPanel() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const canManage = role === "admin" || role === "oic" || role === "2ic";
  const [email, setEmail] = useState("");
  const [period, setPeriod] = useState<Period>("weekly");
  const [testing, setTesting] = useState<Period | null>(null);

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["attendance-recipients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_report_recipients")
        .select("*")
        .order("period")
        .order("email");
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const v = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error("Enter a valid email address");
      const { error } = await supabase.from("attendance_report_recipients").insert({
        email: v.toLowerCase(),
        period,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recipient added");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["attendance-recipients"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance_report_recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["attendance-recipients"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendNow = async (p: Period) => {
    setTesting(p);
    try {
      const { data, error } = await supabase.functions.invoke("attendance-compliance-report", {
        body: { period: p, dry_run: false },
      });
      if (error) throw error;
      toast.success(`${p === "weekly" ? "Weekly" : "Monthly"} report dispatched`, {
        description: `Sent: ${data?.summary?.sent ?? 0} · Failed: ${data?.summary?.failed ?? 0}`,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send report");
    } finally {
      setTesting(null);
    }
  };

  const grouped: Record<Period, any[]> = { weekly: [], monthly: [] };
  recipients.forEach((r: any) => grouped[r.period as Period]?.push(r));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Scheduled Compliance Report Recipients
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Weekly reports run every Monday 06:00. Monthly reports run on the 1st of each month 06:00.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="recipient@example.com" className="h-9" />
            </div>
            <div className="w-32">
              <Label className="text-xs">Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => addMut.mutate()} disabled={addMut.isPending} size="sm">Add</Button>
          </div>
        )}

        {(["weekly", "monthly"] as Period[]).map((p) => (
          <div key={p} className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {p} ({grouped[p].length})
              </h4>
              {canManage && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => sendNow(p)} disabled={testing === p || grouped[p].length === 0}>
                  {testing === p ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Send now
                </Button>
              )}
            </div>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : grouped[p].length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No recipients configured</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {grouped[p].map((r: any) => (
                  <Badge key={r.id} variant="secondary" className="gap-1.5 pl-2 pr-1 py-1">
                    {r.email}
                    {canManage && (
                      <button
                        onClick={() => removeMut.mutate(r.id)}
                        className="hover:bg-destructive/20 rounded p-0.5"
                        aria-label={`Remove ${r.email}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
