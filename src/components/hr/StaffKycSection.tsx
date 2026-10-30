import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StaffDocumentVault } from "@/components/staff/StaffDocumentVault";
import { KYC_FIELDS, buildKycRows } from "@/lib/hrm-kyc-export";

const KYC_KEYS = ["staff_id", "last_name", "first_name", "other_names", "gender", "date_of_birth", "ghana_card_number", "phone", "email", "residential_address", "digital_address", "blood_group", "height_cm", "hometown", "region_of_origin"];

/** KYC summary + documents for one staff member; sensitive values masked by rank on the server rule. */
export function StaffKycSection({ profile, photoUrl, canManage, vaultAllowed }: { profile: Record<string, any>; photoUrl?: string | null; canManage: boolean; vaultAllowed: boolean }) {
  const { data: full = false, isLoading } = useQuery({
    queryKey: ["kyc-access", profile.id],
    queryFn: async () => {
      const { data } = await (supabase.rpc as any)("kyc_access", { _profile_ids: [profile.id] });
      return data?.[0]?.full_access === true;
    },
  });
  const { headers, rows } = buildKycRows([profile], KYC_FIELDS.map((f) => f.key).filter((k) => KYC_KEYS.includes(k)), full);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">KYC details</CardTitle>
            <CardDescription>Identity and contact details used for verification.</CardDescription>
          </div>
          {!isLoading && (full
            ? <Badge className="gap-1"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Full view</Badge>
            : <Badge variant="secondary" className="gap-1"><ShieldAlert className="h-3 w-3" aria-hidden="true" /> Masked by rank</Badge>)}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <div className="flex h-[170px] w-[140px] items-center justify-center overflow-hidden rounded-md border bg-muted text-xs text-muted-foreground">
            {full && photoUrl ? <img src={photoUrl} alt={`Photo of ${profile.first_name} ${profile.last_name}`} className="h-full w-full object-cover" /> : "Photo withheld"}
          </div>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {headers.map((h, i) => (
              <div key={h}><dt className="text-xs text-muted-foreground">{h}</dt><dd className="font-medium">{rows[0][i] || "—"}</dd></div>
            ))}
          </dl>
        </CardContent>
      </Card>
      {full && vaultAllowed ? (
        <StaffDocumentVault profileId={profile.id} canManage={canManage} />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">KYC documents are only shown to officers senior in rank, administrators, OIC and 2IC.</p>
      )}
    </div>
  );
}
