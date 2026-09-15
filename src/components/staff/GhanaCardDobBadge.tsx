/**
 * Compact status chip shown beside the date-of-birth field on the KYC form.
 * Clicking it jumps to the section that holds the Ghana Card check.
 */
import { BadgeCheck, ShieldQuestion, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date-format";
import {
  ghanaCardDobState,
  useGhanaCardDobStatus,
} from "@/hooks/useGhanaCardDobStatus";

export function GhanaCardDobBadge({
  profileId,
  formDob,
  onVerify,
}: {
  profileId: string | null;
  formDob: string;
  onVerify?: () => void;
}) {
  const { data = [], isLoading } = useGhanaCardDobStatus(profileId);
  if (!profileId || isLoading) return null;

  const latest = data[0] ?? null;
  const state = ghanaCardDobState(formDob, latest);

  const chip =
    state === "matched" ? (
      <Badge variant="outline" className="border-emerald-300 text-emerald-700">
        <BadgeCheck className="mr-1 h-3 w-3" aria-hidden="true" /> Matches Ghana Card
      </Badge>
    ) : state === "mismatch" ? (
      <Badge variant="outline" className="border-red-300 text-red-700">
        <TriangleAlert className="mr-1 h-3 w-3" aria-hidden="true" /> Differs from Ghana Card
        {latest?.recorded_dob ? ` (${formatDate(latest.recorded_dob)})` : ""}
      </Badge>
    ) : state === "stale" ? (
      <Badge variant="outline" className="border-amber-300 text-amber-700">
        <TriangleAlert className="mr-1 h-3 w-3" aria-hidden="true" /> Date changed — check the card again
      </Badge>
    ) : (
      <Badge variant="outline" className="text-muted-foreground">
        <ShieldQuestion className="mr-1 h-3 w-3" aria-hidden="true" /> Not checked against Ghana Card
      </Badge>
    );

  return (
    <span className="flex items-center gap-1">
      {chip}
      {onVerify && state !== "matched" && (
        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onVerify}>
          Check
        </Button>
      )}
    </span>
  );
}

export default GhanaCardDobBadge;
