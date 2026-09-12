/**
 * Optional dependants table for the staff bio-data record (section H).
 *
 * Entirely optional — a record can be saved with no dependants at all.
 * Administrators can add as many rows as needed.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RepeatingRows, type RepeatingColumn } from "@/components/staff/biodata/RepeatingRows";

const COLUMNS: RepeatingColumn[] = [
  { key: "full_name", label: "Full name", type: "text" },
  { key: "relationship", label: "Relationship", type: "text" },
  { key: "date_of_birth", label: "Date of birth", type: "date" },
  { key: "sex", label: "Sex", type: "select", options: ["Male", "Female"] },
  { key: "phone", label: "Telephone", type: "text" },
  { key: "is_beneficiary", label: "Beneficiary", type: "boolean" },
  { key: "notes", label: "Notes", type: "text" },
];

type Row = Record<string, unknown>;

export function DependentsSection({
  profileId,
  canEdit = true,
}: {
  profileId: string | null;
  canEdit?: boolean;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-dependents", profileId],
    queryFn: async () => {
      const { data: res, error } = await supabase
        .from("staff_dependents")
        .select("*")
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (res ?? []) as Row[];
    },
    enabled: !!profileId,
  });

  useEffect(() => { if (data) setRows(data); }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error("Save the staff record first");
      const { error: delErr } = await supabase
        .from("staff_dependents")
        .delete()
        .eq("profile_id", profileId);
      if (delErr) throw delErr;
      const payload = rows
        .filter((r) => String(r.full_name ?? "").trim())
        .map((r) => ({
          profile_id: profileId,
          full_name: String(r.full_name).trim(),
          relationship: (r.relationship as string) || null,
          date_of_birth: (r.date_of_birth as string) || null,
          sex: (r.sex as string) || null,
          phone: (r.phone as string) || null,
          is_beneficiary: !!r.is_beneficiary,
          notes: (r.notes as string) || null,
        }));
      if (payload.length) {
        const { error } = await supabase.from("staff_dependents").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Dependants saved");
      queryClient.invalidateQueries({ queryKey: ["staff-dependents", profileId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h4 className="text-sm font-semibold">Dependants (optional)</h4>
      </div>
      {!profileId ? (
        <p className="text-xs text-muted-foreground">
          Save the staff record first, then dependants can be added.
        </p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">Loading dependants…</p>
      ) : (
        <>
          <RepeatingRows
            columns={COLUMNS}
            rows={rows}
            onChange={setRows}
            addLabel="Add dependant"
            readOnly={!canEdit}
          />
          {canEdit && (
            <Button type="button" size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save dependants
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export default DependentsSection;
