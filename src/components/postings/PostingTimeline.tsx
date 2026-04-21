import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CalendarClock, ArrowRight, CheckCircle2, XCircle, Clock } from "lucide-react";

const statusMeta = (s: string) => {
  switch (s) {
    case "approved":
      return { icon: CheckCircle2, label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" };
    case "rejected":
      return { icon: XCircle, label: "Rejected", className: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" };
    default:
      return { icon: Clock, label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" };
  }
};

export function PostingTimeline() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["my-postings-timeline", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("postings_transfers")
        .select("*, from_dept:departments!postings_transfers_from_department_id_fkey(name), to_dept:departments!postings_transfers_to_department_id_fkey(name)")
        .eq("profile_id", profile!.id)
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-secondary">
          <CalendarClock className="h-5 w-5 text-primary" />
          Posting Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">Loading timeline...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">No posting events yet</div>
        ) : (
          <ol className="relative border-l border-border ml-3 space-y-6" aria-label="Posting and transfer history">
            {records.map((r: any) => {
              const meta = statusMeta(r.status);
              const Icon = meta.icon;
              return (
                <li key={r.id} className="ml-6">
                  <span
                    className={`absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-background ${meta.dot}`}
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <time
                      className="text-sm font-semibold text-foreground"
                      dateTime={r.effective_date}
                    >
                      {format(new Date(r.effective_date), "PPP")}
                    </time>
                    <Badge variant="outline" className={`${meta.className} gap-1`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                    <Badge variant="secondary" className="capitalize">{r.type}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{r.from_dept?.name ?? "—"}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-label="transferred to" />
                    <span className="font-medium text-foreground">{r.to_dept?.name ?? "—"}</span>
                  </div>
                  {r.remarks && (
                    <p className="mt-1.5 text-sm text-muted-foreground italic">"{r.remarks}"</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recorded {format(new Date(r.created_at), "PP")}
                    {r.status !== "pending" && r.updated_at && r.updated_at !== r.created_at && (
                      <> · {meta.label.toLowerCase()} {format(new Date(r.updated_at), "PP")}</>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
