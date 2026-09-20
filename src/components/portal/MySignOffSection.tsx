/**
 * An officer's own sign-off section: where their record stands, anything waiting
 * for their signature, and their own four-step sign-off trail.
 *
 * Every read is self-scoped on the server: `signoff_state` only returns the
 * officer's own trail, and `signoff_my_queue` only lists records whose next
 * step this officer is entitled to sign, inside their own command.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignOffPanel, useSignOffState } from "@/components/shared/SignOffPanel";
import { SignOffQueue, type QueueRow } from "@/components/command/SignOffQueue";
import { nextSignOffStep, SIGNOFF_STEP_LABEL, SIGNOFF_STEP_WHO } from "@/lib/signoff";
import { formatDateTime } from "@/lib/date-format";

/** Count of records waiting for this officer's signature (shared query cache). */
export function useSignOffQueueCount() {
  const { data = [] } = useQuery({
    queryKey: ["signoff-queue"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("signoff_my_queue");
      if (error) throw error;
      return (data ?? []) as unknown as QueueRow[];
    },
  });
  return data.length;
}

/** Plain-language summary of where the officer's own record stands. */
export function useMyRecordStatus(profileId: string | null | undefined) {
  const { data: state, isLoading } = useSignOffState("staff_biodata", profileId ?? null);
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

  return { status, steps, signedCount, lastSigned };
}

export function MyRecordStatusCard({ profileId }: { profileId: string | null | undefined }) {
  const { status, steps, signedCount, lastSigned } = useMyRecordStatus(profileId);

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
          <Progress
            value={steps.length ? Math.round((signedCount / steps.length) * 100) : 0}
            aria-label="Sign-off progress"
          />
          <p className="text-xs text-muted-foreground">
            {signedCount} of {steps.length || 4} steps signed
            {lastSigned ? ` · last signed ${formatDateTime(lastSigned)}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function MySignOffSection({
  profileId,
  staffId,
  fullName,
}: {
  profileId: string | null | undefined;
  staffId?: string | null;
  fullName: string;
}) {
  const [signingRow, setSigningRow] = useState<QueueRow | null>(null);

  if (!profileId) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">Loading your record…</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <MyRecordStatusCard profileId={profileId} />
      <SignOffQueue onSign={(row) => setSigningRow(row)} />
      <SignOffPanel
        entityType="staff_biodata"
        entityId={profileId}
        subjectName={fullName}
        documentTitle="Staff record sign-off"
        recordSummary={`Staff record of ${fullName} (${staffId ?? "no staff number"})`}
        defaultSignatoryName={fullName}
      />

      <Dialog open={!!signingRow} onOpenChange={(open) => !open && setSigningRow(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sign-off</DialogTitle>
            <DialogDescription>
              {signingRow?.staff_name ?? "Staff record"}
              {signingRow?.staff_id ? ` · ${signingRow.staff_id}` : ""}
            </DialogDescription>
          </DialogHeader>
          {signingRow && (
            <SignOffPanel
              entityType={signingRow.entity_type}
              entityId={signingRow.entity_id}
              subjectName={signingRow.staff_name ?? "Staff record"}
              documentTitle="Staff record sign-off"
              recordSummary={`Staff record of ${signingRow.staff_name ?? "officer"} (${signingRow.staff_id ?? "no staff number"})`}
              defaultSignatoryName={fullName}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MySignOffSection;
