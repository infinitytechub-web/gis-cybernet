/**
 * Signature block for a staff record or an authorised command official.
 *
 * Loads any signature already on file for the given purpose, lets the person
 * sign, and saves it with its fingerprint. Signatures are stored in
 * `staff_signatures`; the database stamps who saved each one.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/date-format";
import { SignaturePad, type SignatureCapture } from "@/components/shared/SignaturePad";

export function SignatureBlock({
  profileId,
  purpose,
  label = "Signature",
  defaultName = "",
  defaultRole = "",
  disabled,
}: {
  profileId: string;
  /** e.g. "staff_declaration", "checked_by", "verified_by", "approved_by" */
  purpose: string;
  label?: string;
  defaultName?: string;
  defaultRole?: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState(defaultRole);

  const { data: existing } = useQuery({
    queryKey: ["staff-signature", profileId, purpose],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_signatures")
        .select("*")
        .eq("profile_id", profileId)
        .eq("purpose", purpose)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as {
        signature_data_url: string;
        signature_hash: string;
        signatory_name: string | null;
        signatory_role: string | null;
        signed_at: string;
      } | null;
    },
    enabled: !!profileId,
  });

  const save = useMutation({
    mutationFn: async (capture: SignatureCapture) => {
      const { error } = await supabase.from("staff_signatures").insert({
        profile_id: profileId,
        purpose,
        signature_data_url: capture.dataUrl,
        signature_hash: capture.fingerprint,
        signatory_name: capture.signatoryName || null,
        signatory_role: capture.signatoryRole || null,
        signed_at: capture.signedAt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Signature saved");
      queryClient.invalidateQueries({ queryKey: ["staff-signature", profileId, purpose] });
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
            {existing.signatory_name ?? "—"}
            {existing.signatory_role ? ` · ${existing.signatory_role}` : ""} ·{" "}
            {formatDateTime(existing.signed_at)}
          </span>
          <span className="font-mono">#{existing.signature_hash.slice(0, 12)}</span>
        </div>
      )}
      <SignaturePad
        label={label}
        signatoryName={name || existing?.signatory_name || ""}
        signatoryRole={role || existing?.signatory_role || ""}
        onNameChange={setName}
        onRoleChange={setRole}
        existingDataUrl={existing?.signature_data_url ?? null}
        disabled={disabled || save.isPending}
        onCapture={(c) => save.mutateAsync(c)}
      />
    </div>
  );
}

export default SignatureBlock;
