/**
 * Officer Portal — a serving officer's own command view: their sign-off steps,
 * their leave standing and their posting history. No administrator needed.
 *
 * Every read is self-scoped on the server:
 *  - `signoff_state` only returns the officer's own record trail
 *  - `leave_due_overview()` narrows to the caller's own row at 'self' scope
 *  - `my_posting_history()` only returns the caller's own transfers
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarOff, FileSignature, ArrowRightLeft, Loader2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignOffPanel, useSignOffState } from "@/components/shared/SignOffPanel";
import { SignOffQueue, type QueueRow } from "@/components/command/SignOffQueue";
import { nextSignOffStep, SIGNOFF_STEP_LABEL, SIGNOFF_STEP_WHO } from "@/lib/signoff";
import { formatDate, formatDateTime } from "@/lib/date-format";



interface MyProfile {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  shift_group: string | null;
  status: string | null;
}

interface LeaveRow {
  profile_id: string;
  full_name: string | null;
  unit_name: string | null;
  grade: string | null;
  entitlement: number;
  taken: number;
  remaining: number;
  last_leave_end: string | null;
  state: string;
}

interface PostingRow {
  id: string;
  from_unit_name: string | null;
  to_unit_name: string | null;
  from_shift_group: string | null;
  to_shift_group: string | null;
  reason: string | null;
  effective_date: string | null;
  created_at: string;
}

const LEAVE_STATE: Record<string, { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
  due: { label: "Due", className: "bg-amber-100 text-amber-800" },
  on_track: { label: "On track", className: "bg-sky-100 text-sky-800" },
  taken: { label: "Fully taken", className: "bg-emerald-100 text-emerald-800" },
};

/**
 * Tells the officer where their record stands: not yet submitted, submitted and
 * waiting on a named stage of the chain, or fully approved. The figures come
 * from the same server view the commanders' queue uses, so the two agree.
 */
function MySignOffStatus({ profileId }: { profileId: string }) {
  const { data: state, isLoading } = useSignOffState("staff_biodata", profileId);
  const steps = state?.steps ?? [];
  const next = nextSignOffStep(steps);
  const signedCount = steps.filter((s) => s.signed).length;
  const declarationSigned = steps.find((s) => s.step === "staff_declaration")?.signed ?? false;
  const lastSigned = steps.filter((s) => s.signed_at).map((s) => s.signed_at!).sort().at(-1) ?? null;

  const status = !steps.length || isLoading
    ? { label: "Loading…", className: "bg-muted text-muted-foreground", detail: "Checking your record." }
    : !next
      ? {
          label: "Fully approved",
          className: "bg-emerald-100 text-emerald-800",
          detail: "Every step has been signed. You can open the signed certificate below.",
        }
      : !declarationSigned
        ? {
            label: "Not yet submitted",
            className: "bg-amber-100 text-amber-800",
            detail: "Sign your declaration below to send your record to your commander.",
          }
        : {
            label: `Submitted — with ${SIGNOFF_STEP_LABEL[next.step] ?? next.step}`,
            className: "bg-sky-100 text-sky-800",
            detail: `Waiting for ${(SIGNOFF_STEP_WHO[next.step] ?? "the next signatory").toLowerCase()}. You do not need to do anything else.`,
          };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Where my record stands</CardTitle>
          <Badge className={status.className}>{status.label}</Badge>
        </div>
        <CardDescription>{status.detail}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Progress value={steps.length ? Math.round((signedCount / steps.length) * 100) : 0} aria-label="Sign-off progress" />
          <p className="text-xs text-muted-foreground">
            {signedCount} of {steps.length || 4} steps signed
            {lastSigned ? ` · last signed ${formatDateTime(lastSigned)}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OfficerPortal() {

  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["officer-portal-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, shift_group, status")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MyProfile | null;
    },
  });

  const { data: leaveRows = [], isLoading: leaveLoading } = useQuery({
    queryKey: ["officer-portal-leave"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leave_due_overview", { _org_unit_id: null });
      if (error) throw error;
      return (data ?? []) as LeaveRow[];
    },
  });

  const { data: postings = [], isLoading: postingsLoading } = useQuery({
    queryKey: ["officer-portal-postings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_posting_history");
      if (error) throw error;
      return (data ?? []) as PostingRow[];
    },
  });

  const myLeave = useMemo(
    () => leaveRows.find((r) => r.profile_id === profile?.id) ?? null,
    [leaveRows, profile?.id],
  );

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "My record";
  const state = myLeave ? LEAVE_STATE[myLeave.state] ?? LEAVE_STATE.on_track : null;
  const usedPct = myLeave && myLeave.entitlement > 0
    ? Math.min(100, Math.round((Number(myLeave.taken) / Number(myLeave.entitlement)) * 100))
    : 0;

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-primary/10 p-2">
            <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold text-secondary sm:text-2xl">Officer Portal</h1>
          {profile?.staff_id && <Badge variant="outline" className="font-mono text-xs">{profile.staff_id}</Badge>}
          {myLeave?.unit_name && <Badge variant="secondary">{myLeave.unit_name}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Your own sign-off steps, leave standing and posting history — nothing from other officers.
        </p>
      </header>

      <Tabs defaultValue="signoffs">
        <TabsList className="flex w-full flex-col sm:inline-flex sm:w-auto sm:flex-row">
          <TabsTrigger value="signoffs" className="w-full gap-1.5 sm:w-auto">
            <FileSignature className="h-4 w-4" aria-hidden="true" /> My sign-offs
          </TabsTrigger>
          <TabsTrigger value="leave" className="w-full gap-1.5 sm:w-auto">
            <CalendarOff className="h-4 w-4" aria-hidden="true" /> My leave status
          </TabsTrigger>
          <TabsTrigger value="postings" className="w-full gap-1.5 sm:w-auto">
            <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> My postings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signoffs" className="mt-4">
          {profile?.id ? (
            <div className="space-y-4">
              <MySignOffStatus profileId={profile.id} />
              <SignOffQueue onSign={(row) => setSigningRow(row)} />
              <SignOffPanel
                entityType="staff_biodata"
                entityId={profile.id}
                subjectName={fullName}
                documentTitle="Staff record sign-off"
                recordSummary={`Staff record of ${fullName} (${profile.staff_id ?? "no staff number"})`}
                defaultSignatoryName={fullName}
              />
            </div>

          ) : (

            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                Loading your record…
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="leave" className="mt-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">My leave standing ({new Date().getFullYear()})</CardTitle>
              <CardDescription>
                Working days only — weekends and public holidays are not counted against your leave.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {leaveLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your leave…
                </div>
              ) : !myLeave ? (
                <p className="text-sm text-muted-foreground">
                  No leave entitlement is recorded for you yet. Ask your command to check your posting.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {state && <Badge className={state.className}>{state.label}</Badge>}
                    {myLeave.grade && <Badge variant="outline">{myLeave.grade === "senior" ? "Senior grade" : "Junior grade"}</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: "Entitlement", value: `${Number(myLeave.entitlement)} days` },
                      { label: "Days taken", value: `${Number(myLeave.taken)} days` },
                      { label: "Days remaining", value: `${Number(myLeave.remaining)} days` },
                      { label: "Last leave ended", value: myLeave.last_leave_end ? formatDate(myLeave.last_leave_end) : "—" },
                    ].map((t) => (
                      <div key={t.label} className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">{t.label}</p>
                        <p className="text-sm font-semibold">{t.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Progress value={usedPct} aria-label="Leave used" />
                    <p className="text-xs text-muted-foreground">{usedPct}% of your leave used</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="postings" className="mt-4">
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">My posting and shift changes</CardTitle>
                <Badge variant="secondary">{postings.length}</Badge>
              </div>
              <CardDescription>Every move recorded for you, most recent first.</CardDescription>
            </CardHeader>
            <CardContent>
              {postingsLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your postings…
                </div>
              ) : postings.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No posting changes are recorded for you. You are currently on shift group{" "}
                  {profile?.shift_group ?? "—"}.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Effective</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {postings.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.effective_date ? formatDate(p.effective_date) : formatDate(p.created_at)}</TableCell>
                          <TableCell>{p.from_unit_name ?? "Unposted"}</TableCell>
                          <TableCell className="font-medium">{p.to_unit_name ?? "Unposted"}</TableCell>
                          <TableCell>
                            {p.from_shift_group !== p.to_shift_group
                              ? `${p.from_shift_group ?? "—"} → ${p.to_shift_group ?? "—"}`
                              : p.to_shift_group ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                            {p.reason ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
