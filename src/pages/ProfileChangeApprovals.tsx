import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Check, X, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/date-format";

type Req = {
  id: string;
  profile_id: string;
  user_id: string;
  requested_changes: Record<string, string | null>;
  previous_values: Record<string, string | null> | null;
  status: "pending" | "supervisor_approved" | "approved" | "rejected" | "cancelled";
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  supervisor_id: string | null;
  supervisor_reviewed_at: string | null;
  supervisor_notes: string | null;
  admin_id: string | null;
  admin_reviewed_at: string | null;
  admin_notes: string | null;
  profiles?: { first_name: string; last_name: string; staff_id: string; email?: string };
};

const FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  emergency_contact_name: "Emergency contact",
  emergency_contact_phone: "Emergency contact phone",
  hobbies: "Hobbies / interests",
  special_skills: "Special skill(s)",
  marital_status: "Marital status",
  next_of_kin: "Next of kin",
  date_of_birth: "Date of birth",
};

const label = (k: string) =>
  FIELD_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function ProfileChangeApprovals() {
  const { user, isAdminOrSupervisor } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [queued, setQueued] = useState<Record<string, boolean>>({});
  // requestId -> set of field keys excluded from approval
  const [excluded, setExcluded] = useState<Record<string, Record<string, boolean>>>({});

  const allowed = isAdminOrSupervisor;

  const { data: requests = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["profile-change-requests", tab],
    queryFn: async () => {
      let q = supabase
        .from("profile_change_requests")
        .select("*, profiles:profile_id(first_name, last_name, staff_id, email)")
        .order("created_at", { ascending: false });
      if (tab === "pending") q = q.eq("status", "pending");
      else q = q.in("status", ["approved", "rejected", "cancelled"]);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as (Req & { profiles?: any })[];
    },
    enabled: allowed,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return requests;
    return requests.filter((r) => {
      const name = `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.toLowerCase();
      const fields = Object.keys(r.requested_changes || {}).join(" ").toLowerCase();
      return (
        name.includes(term) ||
        (r.profiles?.staff_id ?? "").toLowerCase().includes(term) ||
        fields.includes(term)
      );
    });
  }, [requests, search]);

  const notifyStaff = async (
    id: string,
    status: "approved" | "rejected" | "pending",
    req: any,
    reviewedAt: string
  ) => {
    const recipientEmail: string | null = req?.profiles?.email ?? null;
    if (!recipientEmail || !user) return;
    try {
      const { data: me } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const reviewerName = me ? `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() : undefined;
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "profile-change-status",
          recipientEmail,
          idempotencyKey: `pcr-${id}-${status}`,
          templateData: {
            recipientName: req?.profiles
              ? `${req.profiles.first_name ?? ""} ${req.profiles.last_name ?? ""}`.trim()
              : undefined,
            status,
            fields: Object.keys(req?.requested_changes ?? {}),
            reviewerName,
            reviewerNotes: notes[id] ?? null,
            reviewedAt: formatDateTime(reviewedAt),
            requestUrl: `${window.location.origin}/my-profile?request=${id}`,
          },
        },
      });
    } catch (err) {
      console.warn("Email alert failed:", err);
    }
  };

  const reviewOne = async (
    id: string,
    status: "approved" | "rejected" | "pending",
    req: Req
  ) => {
    if (!user) throw new Error("Not signed in");
    const reviewedAt = new Date().toISOString();

    // Selective approval: only keep the fields still ticked for this request.
    let changes = req.requested_changes || {};
    if (status === "approved") {
      const drop = excluded[id] || {};
      const kept = Object.fromEntries(Object.entries(changes).filter(([k]) => !drop[k]));
      if (Object.keys(kept).length === 0) {
        throw new Error("Select at least one field to approve.");
      }
      changes = kept;
    }

    const { error } = await supabase
      .from("profile_change_requests")
      .update({
        requested_changes: changes,
        status,
        reviewer_id: user.id,
        reviewer_notes: notes[id] ?? null,
        reviewed_at: reviewedAt,
      })
      .eq("id", id);
    if (error) throw error;

    await notifyStaff(id, status, { ...req, requested_changes: changes }, reviewedAt);
  };

  const review = useMutation({
    mutationFn: async ({ id, status, req }: { id: string; status: "approved" | "rejected" | "pending"; req: Req }) =>
      reviewOne(id, status, req),
    onSuccess: (_d, v) => {
      toast.success(
        v.status === "approved"
          ? "Change approved and applied to the profile."
          : v.status === "rejected"
          ? "Request rejected."
          : "Returned to the pending queue."
      );
      setQueued((q) => ({ ...q, [v.id]: false }));
      qc.invalidateQueries({ queryKey: ["profile-change-requests"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update request"),
  });

  const bulkReview = useMutation({
    mutationFn: async (status: "approved" | "rejected") => {
      const targets = filtered.filter((r) => r.status === "pending" && queued[r.id]);
      if (targets.length === 0) throw new Error("No requests selected.");
      let ok = 0;
      const failures: string[] = [];
      for (const r of targets) {
        try {
          await reviewOne(r.id, status, r);
          ok += 1;
        } catch (err: any) {
          failures.push(
            `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() ||
              r.profiles?.staff_id ||
              r.id
          );
        }
      }
      return { ok, failures, status };
    },
    onSuccess: ({ ok, failures, status }) => {
      if (ok > 0) {
        toast.success(`${ok} request${ok === 1 ? "" : "s"} ${status === "approved" ? "approved" : "rejected"}.`);
      }
      if (failures.length > 0) toast.error(`Could not process: ${failures.join(", ")}`);
      setQueued({});
      qc.invalidateQueries({ queryKey: ["profile-change-requests"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Bulk action failed"),
  });

  const pendingRequests = useMemo(
    () => filtered.filter((r) => r.status === "pending"),
    [filtered]
  );
  const selectedCount = pendingRequests.filter((r) => queued[r.id]).length;
  const busy = review.isPending || bulkReview.isPending;

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
        title="Staff Change Approvals"
        subtitle="Queue, review and approve profile edits submitted by staff. Approving applies the ticked fields to the staff record."
      />

      <Card>
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name, staff ID or field"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab === "pending" && (
              <>
                <span className="text-xs text-muted-foreground">
                  {selectedCount} queued
                </span>
                <Button
                  size="sm"
                  className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={busy || selectedCount === 0}
                  onClick={() => bulkReview.mutate("approved")}
                >
                  <Check className="h-4 w-4" /> Approve queued
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1"
                  disabled={busy || selectedCount === 0}
                  onClick={() => bulkReview.mutate("rejected")}
                >
                  <X className="h-4 w-4" /> Reject queued
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" className="gap-1" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setQueued({}); }}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {tab === "pending" && pendingRequests.length > 0 && (
              <Badge variant="secondary" className="ml-2">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-3 mt-4">
          {tab === "pending" && pendingRequests.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={selectedCount === pendingRequests.length && selectedCount > 0}
                onCheckedChange={(c) =>
                  setQueued(
                    c ? Object.fromEntries(pendingRequests.map((r) => [r.id, true])) : {}
                  )
                }
              />
              Queue all shown requests
            </label>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              No {tab === "pending" ? "pending requests" : "history"} to display.
            </CardContent></Card>
          ) : (
            filtered.map((r) => {
              const drop = excluded[r.id] || {};
              const entries = Object.entries(r.requested_changes || {});
              return (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        {r.status === "pending" && (
                          <Checkbox
                            className="mt-1"
                            checked={!!queued[r.id]}
                            onCheckedChange={(c) => setQueued((q) => ({ ...q, [r.id]: !!c }))}
                            aria-label="Add to approval queue"
                          />
                        )}
                        <div>
                          <CardTitle className="text-sm">
                            {r.profiles?.first_name} {r.profiles?.last_name}{" "}
                            <span className="text-muted-foreground font-normal">({r.profiles?.staff_id})</span>
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Submitted {formatDateTime(r.created_at)} · {entries.length} field{entries.length === 1 ? "" : "s"}
                          </CardDescription>
                        </div>
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
                    <div className="rounded border overflow-x-auto text-xs">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            {r.status === "pending" && <th className="text-left p-2 w-10">Apply</th>}
                            <th className="text-left p-2">Field</th>
                            <th className="text-left p-2">Current</th>
                            <th className="text-left p-2">Requested</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(([k, v]) => (
                            <tr key={k} className="border-t">
                              {r.status === "pending" && (
                                <td className="p-2">
                                  <Checkbox
                                    checked={!drop[k]}
                                    onCheckedChange={(c) =>
                                      setExcluded((prev) => ({
                                        ...prev,
                                        [r.id]: { ...(prev[r.id] || {}), [k]: !c },
                                      }))
                                    }
                                    aria-label={`Apply ${label(k)}`}
                                  />
                                </td>
                              )}
                              <td className="p-2 font-medium">{label(k)}</td>
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
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            onClick={() => review.mutate({ id: r.id, status: "approved", req: r })}
                            disabled={busy}
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Check className="h-4 w-4" /> Approve ticked fields
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => review.mutate({ id: r.id, status: "rejected", req: r })}
                            disabled={busy}
                            className="gap-1"
                          >
                            <X className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        {r.reviewed_at && (
                          <div className="text-xs text-muted-foreground">
                            Reviewed {formatDateTime(r.reviewed_at)}
                          </div>
                        )}
                        {r.reviewer_notes && (
                          <div className="text-xs text-muted-foreground">
                            Reviewer notes: <span className="text-foreground">{r.reviewer_notes}</span>
                          </div>
                        )}
                        {(r.status === "approved" || r.status === "rejected") && (
                          <div className="flex flex-col gap-2">
                            <Textarea
                              placeholder="Notes for re-review (optional)"
                              value={notes[r.id] ?? ""}
                              onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                              rows={2}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => review.mutate({ id: r.id, status: "pending", req: r })}
                              disabled={busy}
                            >
                              Return to pending queue
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
