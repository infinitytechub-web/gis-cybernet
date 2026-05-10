import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Check, X } from "lucide-react";
import { toast } from "sonner";

type Req = {
  id: string;
  profile_id: string;
  user_id: string;
  requested_changes: Record<string, string | null>;
  previous_values: Record<string, string | null> | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: { first_name: string; last_name: string; staff_id: string };
};

export default function ProfileChangeApprovals() {
  const { user, isAdminOrSupervisor } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const allowed = isAdminOrSupervisor;

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["profile-change-requests", tab],
    queryFn: async () => {
      let q = supabase
        .from("profile_change_requests")
        .select("*, profiles:profile_id(first_name, last_name, staff_id)")
        .order("created_at", { ascending: false });
      if (tab === "pending") q = q.eq("status", "pending");
      else q = q.in("status", ["approved", "rejected", "cancelled"]);
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Req[];
    },
    enabled: allowed,
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profile_change_requests")
        .update({
          status,
          reviewer_id: user.id,
          reviewer_notes: notes[id] ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Change approved and applied." : "Request rejected.");
      qc.invalidateQueries({ queryKey: ["profile-change-requests"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update request"),
  });

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Only Admin and Command-tier officers can review profile change requests.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ShieldCheck}
        title="Profile Change Approvals"
        subtitle="Review profile edits submitted by staff. Approving applies the changes to the system."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending {tab === "pending" && pendingCount > 0 && (
              <Badge variant="secondary" className="ml-2">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-3 mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : requests.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              No {tab === "pending" ? "pending requests" : "history"} to display.
            </CardContent></Card>
          ) : (
            requests.map((r) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">
                        {r.profiles?.first_name} {r.profiles?.last_name}{" "}
                        <span className="text-muted-foreground font-normal">({r.profiles?.staff_id})</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Submitted {new Date(r.created_at).toLocaleString()}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        r.status === "approved" ? "border-emerald-500 text-emerald-700" :
                        r.status === "rejected" ? "border-red-500 text-red-700" :
                        r.status === "cancelled" ? "" :
                        "border-amber-500 text-amber-700"
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded border overflow-hidden text-xs">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-2">Field</th>
                          <th className="text-left p-2">Current</th>
                          <th className="text-left p-2">Requested</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(r.requested_changes || {}).map(([k, v]) => (
                          <tr key={k} className="border-t">
                            <td className="p-2 font-medium">{k}</td>
                            <td className="p-2 text-muted-foreground">
                              {(r.previous_values?.[k] ?? "—") || "—"}
                            </td>
                            <td className="p-2">{(v ?? "—") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {r.status === "pending" ? (
                    <>
                      <Textarea
                        placeholder="Reviewer notes (optional)"
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => review.mutate({ id: r.id, status: "approved" })}
                          disabled={review.isPending}
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => review.mutate({ id: r.id, status: "rejected" })}
                          disabled={review.isPending}
                          className="gap-1"
                        >
                          <X className="h-4 w-4" /> Reject
                        </Button>
                      </div>
                    </>
                  ) : r.reviewer_notes ? (
                    <div className="text-xs text-muted-foreground">
                      Reviewer notes: <span className="text-foreground">{r.reviewer_notes}</span>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
