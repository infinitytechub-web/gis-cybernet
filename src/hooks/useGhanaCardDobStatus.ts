/**
 * Latest Ghana Card date-of-birth verification for a staff record.
 *
 * The KYC form uses this to show, beside the date-of-birth field, whether the
 * date on the record has been checked against the officer's Ghana Card, and to
 * stop a verified date of birth being quietly changed without a fresh check.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GhanaCardDobVerification {
  id: string;
  status: string | null;
  method: string | null;
  note: string | null;
  recorded_dob: string | null;
  ghana_card_number: string | null;
  created_at: string;
}

export const GHANA_CARD_VERIFICATION_KEY = "ghana-card-verifications";

export function useGhanaCardDobStatus(profileId: string | null) {
  return useQuery({
    queryKey: [GHANA_CARD_VERIFICATION_KEY, profileId],
    enabled: !!profileId,
    staleTime: 30_000,
    queryFn: async (): Promise<GhanaCardDobVerification[]> => {
      const { data, error } = await supabase
        .from("ghana_card_verifications")
        .select("id, status, method, note, recorded_dob, ghana_card_number, created_at")
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as GhanaCardDobVerification[];
    },
  });
}

export type GhanaCardDobState = "unverified" | "matched" | "mismatch" | "stale";

/**
 * Compares the date of birth held on the form with the last card check.
 * `stale` means the card was verified against a different date than the one
 * currently in the form, so the check has to be repeated.
 */
export function ghanaCardDobState(
  formDob: string,
  latest?: GhanaCardDobVerification | null,
): GhanaCardDobState {
  if (!latest || !latest.recorded_dob) return "unverified";
  if (latest.status !== "matched") return "mismatch";
  if (!formDob) return "stale";
  return latest.recorded_dob === formDob ? "matched" : "stale";
}
