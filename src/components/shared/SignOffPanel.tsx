/**
 * Sign-off and signatory interface for a record.
 *
 * Shows the chain of sign-off steps in order, who may sign each, and the
 * signature already on file. The officer whose turn it is signs on the pad; the
 * signature is stored immutably and the step is recorded through the
 * `record_signoff` routine, which refuses out-of-turn, duplicate or
 * unauthorised sign-offs. Anyone permitted to see the record can open the
 * signed-document view to inspect every signature and its fingerprint.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileSignature, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/date-format";
import { SignaturePad, signatureFingerprint, type SignatureCapture } from "@/components/shared/SignaturePad";
import { WorkflowActions } from "@/components/shared/WorkflowActions";
import { SignedDocumentView } from "@/components/shared/SignedDocumentView";
import {
  SIGNOFF_STEP_HINT, SIGNOFF_STEP_LABEL, SIGNOFF_STEP_WHO,
  nextSignOffStep, signOffProgressLabel, type SignOffState,
} from "@/lib/signoff";

export function useSignOffState(entityType: string, entityId?: string | null) {
  return useQuery({
    queryKey: ["signoff-state", entityType, entityId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("signoff_state", {
        _entity_type: entityType,
        _entity_id: entityId!,
      });
      if (error) throw error;
      return data as unknown as SignOffState;
    },
    enabled: !!entityId,
  });
}

export function SignOffPanel({
  entityType = "staff_biodata",
  entityId,
  recordSummary,
  documentTitle,
  subjectName,
  defaultSignatoryName = "",
  defaultSignatoryRole = "",
}: {
  entityType?: string;
  entityId?: string | null;
  /** Text identifying exactly what is signed; fingerprinted with the signature. */
  recordSummary: string;
  documentTitle: string;
  subjectName: string;
  defaultSignatoryName?: string;
  defaultSignatoryRole?: string;
}) {
  const queryClient = useQueryClient();
  const { data: state, isLoading } = useSignOffState(entityType, entityId);
  const [signing, setSigning] = useState<string | null>(null);
  const [name, setName] = useState(defaultSignatoryName);
  const [role, setRole] = useState(defaultSignatoryRole);
  const [note, setNote] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["signoff-state", entityType, entityId ?? null] });
    queryClient.invalidateQueries({ queryKey: ["signoff-queue"] });
    queryClient.invalidateQueries({ queryKey: ["workflow-transitions", entityType, entityId] });
  };

  const sign = useMutation({
    mutationFn: async ({ step, capture }: { step: string; capture: SignatureCapture }) => {
      if (!entityId) throw new Error("Save the record before signing it");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("You are signed out — sign in again to sign this record");
      const fingerprint = await signatureFingerprint(`${entityType}|${step}|${entityId}|${recordSummary}`);
      const { data: sig, error: sigErr } = await supabase
        .from("staff_signatures")
        .insert({
          profile_id: entityType === "staff_biodata" ? entityId : null,
          signer_user_id: uid,
          signer_name: capture.signatoryName,
          signer_role: capture.signatoryRole || null,
          record_type: `${entityType}:${step}`,
          record_id: entityId,
          record_fingerprint: fingerprint,
          signature_data: capture.dataUrl,
          signature_hash: capture.fingerprint,
          signed_at: capture.signedAt,
          user_agent: navigator.userAgent,
        })
        .select("id")
        .single();
      if (sigErr) throw sigErr;
      const { error } = await supabase.rpc("record_signoff", {
        _entity_type: entityType,
        _entity_id: entityId,
        _step: step,
        _note: note.trim() || null,
        _signature_id: sig.id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`${SIGNOFF_STEP_LABEL[vars.step] ?? "Step"} signed`);
      setSigning(null);
      setNote("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!entityId) {
    return (
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4" aria-hidden="true" /> Sign-off &amp; signatures
          </CardTitle>
          <CardDescription>Save the record first — it can then be signed and sent up the chain.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const steps = state?.steps ?? [];
  const next = nextSignOffStep(steps);
  const complete = steps.length > 0 && !next;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4" aria-hidden="true" /> Sign-off &amp; signatures
          </CardTitle>
          <div className="flex items-center gap-2">
            {complete ? (
              <Badge className="bg-emerald-100 text-emerald-800">
                <ShieldCheck className="mr-1 h-3 w-3" /> Fully signed
              </Badge>
            ) : (
              <Badge variant="secondary">{signOffProgressLabel(steps)}</Badge>
            )}
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" size="sm" variant="outline">View signed document</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] w-[95vw] max-w-3xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{documentTitle}</DialogTitle>
                  <DialogDescription>{subjectName}</DialogDescription>
                </DialogHeader>
                <SignedDocumentView
                  documentTitle={documentTitle}
                  subjectName={subjectName}
                  state={state ?? null}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <CardDescription>
          Each step is signed in turn. The order and the ranks entitled to sign are enforced on the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading sign-off status…
          </p>
        )}

        {/* Phone: the steps sit in their own scrollable panel so the header and
            signed-document button stay in reach; desktop shows them in full. */}
        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
        {steps.map((s) => {
          const isNext = next?.step === s.step;
          return (
            <div key={s.step} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {s.position}. {SIGNOFF_STEP_LABEL[s.step] ?? s.step}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {SIGNOFF_STEP_HINT[s.step]} — {SIGNOFF_STEP_WHO[s.step]}
                  </p>
                </div>
                {s.signed ? (
                  <Badge className="bg-emerald-100 text-emerald-800">
                    <ShieldCheck className="mr-1 h-3 w-3" /> Signed
                  </Badge>
                ) : isNext ? (
                  <Badge className="bg-amber-100 text-amber-800">Awaiting signature</Badge>
                ) : (
                  <Badge variant="outline">Not yet due</Badge>
                )}
              </div>

              {s.signed && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {s.signature_data && (
                    <img
                      src={s.signature_data}
                      alt={`Signature of ${s.signer_name ?? "signatory"}`}
                      className="h-10 rounded border bg-background"
                    />
                  )}
                  <span>
                    {s.signer_name}
                    {s.signer_role ? ` · ${s.signer_role}` : ""}
                    {s.signed_at ? ` · ${formatDateTime(s.signed_at)}` : ""}
                  </span>
                  {s.signature_hash && <span className="font-mono">#{s.signature_hash.slice(0, 12)}</span>}
                  {s.note && <span className="italic">“{s.note}”</span>}
                </div>
              )}

              {!s.signed && isNext && (
                s.can_sign ? (
                  signing === s.step ? (
                    <div className="mt-3 space-y-2">
                      <div>
                        <Label htmlFor={`signoff-note-${s.step}`}>Note (optional)</Label>
                        <Textarea
                          id={`signoff-note-${s.step}`}
                          rows={2}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Anything the next officer in the chain should know"
                        />
                      </div>
                      <SignaturePad
                        label={SIGNOFF_STEP_LABEL[s.step] ?? "Signature"}
                        signatoryName={name}
                        signatoryRole={role}
                        onNameChange={setName}
                        onRoleChange={setRole}
                        disabled={sign.isPending}
                        onCapture={(capture) => sign.mutateAsync({ step: s.step, capture })}
                      />
                      <Button type="button" size="sm" variant="ghost" onClick={() => setSigning(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" size="sm" className="mt-3" onClick={() => setSigning(s.step)}>
                      <PenLine className="mr-1 h-4 w-4" /> Sign this step
                    </Button>
                  )
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Waiting for {SIGNOFF_STEP_WHO[s.step]?.toLowerCase()}.
                  </p>
                )
              )}
            </div>
          );
        })}

        {next && !complete && (
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">Query or refuse this record</p>
            <WorkflowActions
              entityType={entityType}
              entityId={entityId}
              stage={state?.stage ?? null}
              canQuery={next.can_sign}
              canApprove={false}
              canRecommend={false}
              canReject={next.can_sign}
              onChanged={() => refresh()}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SignOffPanel;
