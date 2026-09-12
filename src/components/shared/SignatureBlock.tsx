/**
 * Signature block for a staff record or an authorised command official.
 *
 * Loads any signature already on file for this record and purpose, lets the
 * person sign, and stores the image with a SHA-256 fingerprint of both the
 * signature and the record it covers, the signatory's name and position, the
 * moment of signing and the acting account. Signatures are never overwritten —
 * a new one is added, so the chain of who signed what stays intact.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/date-format";
import {
  SignaturePad, signatureFingerprint, type SignatureCapture,
} from "@/components/shared/SignaturePad";

export function SignatureBlock({
  profileId,
  recordType,
  recordId,
  /** Text that identifies exactly what is being signed; fingerprinted with the signature. */
  recordSummary,
  label = "Signature",
  defaultName = "",
  defaultRole = "",
  disabled,
}: {
  profileId?: string | null;
  /** e.g. "staff_declaration", "checked_by", "verified_by", "approved_by" */
  recordType: string;
  recordId?: string | null;
  recordSummary: string;
  label?: string;
  defaultName?: string;
  defaultRole?: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState(defaultRole);

  const { data: existing } = useQuery({
    queryKey: ["staff-signature", profileId ?? null, recordType, recordId ?? null],
    queryFn: async () => {
      let q = supabase
        .from("staff_signatures")
        .select("signature_data, signature_hash, signer_name, signer_role, signed_at, invalidated_at")
        .eq("record_type", recordType)
        .is("invalidated_at", null)
        .order("signed_at", { ascending: false })
        .limit(1);
      q = profileId ? q.eq("profile_id", profileId) : q.is("profile_id", null);
      if (recordId) q = q.eq("record_id", recordId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!recordType,
  });

  const save = useMutation({
    mutationFn: async (capture: SignatureCapture) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("You are signed out — sign in again to sign this record");
      const recordFingerprint = await signatureFingerprint(
        `${recordType}|${recordId ?? profileId ?? ""}|${recordSummary}`,
      );
      const { error } = await supabase.from("staff_signatures").insert({
        profile_id: profileId ?? null,
        signer_user_id: uid,
        signer_name: capture.signatoryName,
        signer_role: capture.signatoryRole || null,
        record_type: recordType,
        record_id: recordId ?? null,
        record_fingerprint: recordFingerprint,
        signature_data: capture.dataUrl,
        signature_hash: capture.fingerprint,
        signed_at: capture.signedAt,
        user_agent: navigator.userAgent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Signature saved");
      queryClient.invalidateQueries({
        queryKey: ["staff-signature", profileId ?? null, recordType, recordId ?? null],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {existing && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge className="bg-emerald-100 text-emerald-800">
            <ShieldCheck className="mr-1 h-3 w-3" /> Signed
          </Badge>
          <span>
            {existing.signer_name}
            {existing.signer_role ? ` · ${existing.signer_role}` : ""} ·{" "}
            {formatDateTime(existing.signed_at)}
          </span>
          <span className="font-mono">#{existing.signature_hash.slice(0, 12)}</span>
        </div>
      )}
      <SignaturePad
        label={label}
        signatoryName={name || existing?.signer_name || ""}
        signatoryRole={role || existing?.signer_role || ""}
        onNameChange={setName}
        onRoleChange={setRole}
        existingDataUrl={existing?.signature_data ?? null}
        disabled={disabled || save.isPending}
        onCapture={(c) => save.mutateAsync(c)}
      />
    </div>
  );
}

export default SignatureBlock;
