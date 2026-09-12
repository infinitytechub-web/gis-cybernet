/**
 * Ghana Card date-of-birth verification pathway.
 *
 * Records the date of birth as it appears on the officer's Ghana Card (keyed in
 * or taken from an MRZ scan) and compares it with the date of birth on the
 * staff record. The comparison, the card number and the outcome are stored in
 * `ghana_card_verifications` so the check can be matched against the national
 * card register once that integration is switched on after deployment.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BadgeCheck, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { DATE_FORMAT_HINT, formatDate, formatDateTime } from "@/lib/date-format";

export function GhanaCardDobCheck({
  profileId,
  recordDob,
  ghanaCardNumber,
}: {
  profileId: string | null;
  /** Date of birth currently on the staff record (yyyy-MM-dd). */
  recordDob: string;
  ghanaCardNumber: string;
}) {
  const queryClient = useQueryClient();
  const [cardDob, setCardDob] = useState("");
  const [note, setNote] = useState("");

  const { data: history = [] } = useQuery({
    queryKey: ["ghana-card-verifications", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ghana_card_verifications")
        .select("id, status, method, note, recorded_dob, ghana_card_number, created_at")
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profileId,
  });

  const matches = !!cardDob && !!recordDob && cardDob === recordDob;

  const record = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error("Save the staff record first");
      if (!cardDob) throw new Error("Enter the date of birth shown on the Ghana Card");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("You are signed out — sign in again to continue");
      const { error } = await supabase.from("ghana_card_verifications").insert({
        profile_id: profileId,
        ghana_card_number: ghanaCardNumber || null,
        recorded_dob: cardDob,
        status: matches ? "matched" : "mismatch",
        method: "manual_card_entry",
        note: note.trim() || null,
        requested_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verification recorded");
      queryClient.invalidateQueries({ queryKey: ["ghana-card-verifications", profileId] });
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <BadgeCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h4 className="text-sm font-semibold">Ghana Card date-of-birth check</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Record date of birth: {recordDob ? formatDate(recordDob) : "not set"} · Card number:{" "}
        {ghanaCardNumber || "not set"}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="gc-dob">Date of birth on the card ({DATE_FORMAT_HINT})</Label>
          <DateInput id="gc-dob" value={cardDob} onChange={(e) => setCardDob(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="gc-card">Card number (as printed)</Label>
          <Input id="gc-card" value={ghanaCardNumber} readOnly className="bg-muted/40" />
        </div>
      </div>

      {cardDob && recordDob && (
        matches ? (
          <Badge className="bg-emerald-100 text-emerald-800">Dates match</Badge>
        ) : (
          <Badge className="bg-red-100 text-red-800">
            <TriangleAlert className="mr-1 h-3 w-3" /> Dates do not match
          </Badge>
        )
      )}

      <div>
        <Label htmlFor="gc-note">Note (optional)</Label>
        <Textarea id="gc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <Button type="button" size="sm" variant="outline" disabled={record.isPending || !cardDob} onClick={() => record.mutate()}>
        {record.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Record verification
      </Button>

      {history.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {history.map((h) => (
            <li key={h.id}>
              {h.status === "matched" ? "Matched" : "Mismatch"} ·{" "}
              {h.recorded_dob ? formatDate(h.recorded_dob) : "—"} · {formatDateTime(h.created_at)}
              {h.note ? ` · ${h.note}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default GhanaCardDobCheck;
