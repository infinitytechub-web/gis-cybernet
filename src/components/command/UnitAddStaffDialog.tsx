/**
 * ADD STAFF (Unit Dashboard) — create a staff member who is not in the
 * bulk-uploaded list and post them straight to a Command / Department / Unit
 * with a designated role.
 *
 * The insert payload mirrors the Staff / Employees page exactly, so manually
 * added and bulk-uploaded records share one standardized structure. Duplicate
 * staff IDs and Ghana Cards are checked before insert so the user sees a plain
 * message instead of a database constraint error. A login account is created
 * through the same account-provisioning edge function used by staff onboarding.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, KeyRound, Loader2, UserPlus } from "lucide-react";
import { validateGhanaPhone } from "@/lib/ghana-phone";
import { GhanaPhoneInput } from "@/components/ui/ghana-phone-input";
import { isValidGhanaCard } from "@/components/shared/GhanaCardInput";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { orgUnitPath, type OrgUnit } from "@/lib/org-hierarchy";
import { ROSTER_ASSIGNABLE_ROLES } from "@/hooks/useStaffRoster";
import { roleLabel } from "@/lib/role-labels";

type Created = { username: string; password: string; name: string; staffId: string };

export function UnitAddStaffDialog({
  open,
  onOpenChange,
  units,
  defaultOrgUnitId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: OrgUnit[];
  defaultOrgUnitId: string | null;
}) {
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [rankId, setRankId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [unit, setUnit] = useState("");
  const [role, setRole] = useState<string>("staff");
  const [ghanaCard, setGhanaCard] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  useEffect(() => {
    if (open) {
      setCreated(null);
      setOrgUnitId(defaultOrgUnitId ?? "");
    }
  }, [open, defaultOrgUnitId]);

  const { data: ranks = [] } = useQuery({
    queryKey: ["ranks"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("ranks").select("*").order("level", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const unitOptions = useMemo(
    () =>
      [...units].sort((a, b) => orgUnitPath(units, a.id).localeCompare(orgUnitPath(units, b.id))),
    [units],
  );

  const reset = () => {
    setStaffId(""); setFirstName(""); setLastName(""); setGender("");
    setPhone(""); setRankId(""); setDeptId(""); setUnit(""); setRole("staff"); setGhanaCard("");
  };

  const save = useMutation({
    mutationFn: async (): Promise<Created> => {
      if (!staffId.trim() || !firstName.trim() || !lastName.trim()) {
        throw new Error("Staff ID, first name and last name are required");
      }
      if (!orgUnitId) throw new Error("Select the Command / Unit this staff member is posted to");
      if (ghanaCard && !isValidGhanaCard(ghanaCard)) {
        throw new Error("Ghana Card must be in the format GHA-XXXXXXXXX-X");
      }
      let localPhone: string | null = null;
      if (phone.trim()) {
        const res = validateGhanaPhone(phone);
        if (!res.valid) throw new Error(`Invalid phone "${phone}" — ${res.error}`);
        localPhone = res.local || phone.trim();
      }

      // ── Duplicate validation (staff ID is uniquely indexed; Ghana Card is not)
      const { data: dupeId } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id")
        .eq("staff_id", staffId.trim())
        .maybeSingle();
      if (dupeId) {
        throw new Error(
          `Staff ID ${dupeId.staff_id} already belongs to ${dupeId.first_name} ${dupeId.last_name} — open their record instead of creating a duplicate.`,
        );
      }
      if (ghanaCard.trim()) {
        const { data: dupeCard } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, staff_id")
          .eq("ghana_card_number", ghanaCard.trim())
          .maybeSingle();
        if (dupeCard) {
          throw new Error(
            `That Ghana Card is already on record for ${dupeCard.first_name} ${dupeCard.last_name} (${dupeCard.staff_id}).`,
          );
        }
      }

      // ── Same payload shape as the Staff / Employees page
      const payload: any = {
        staff_id: staffId.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        gender: gender || null,
        phone: localPhone,
        unit: unit || null,
        rank_id: rankId || null,
        department_id: deptId || null,
        org_unit_id: orgUnitId,
        status: "active",
        ghana_card_number: ghanaCard.trim() || null,
      };

      const { data: inserted, error } = await supabase
        .from("profiles")
        .insert(payload)
        .select("id, staff_id, first_name, last_name")
        .single();
      if (error) {
        if ((error as any).code === "23505") {
          throw new Error("A staff member with that Staff ID already exists.");
        }
        throw error;
      }

      // ── Login account + designated role
      const { data: acc, error: fnErr } = await supabase.functions.invoke("bulk-create-accounts", {
        body: { profile_ids: [inserted.id], role },
      });
      if (fnErr) {
        const msg = await extractEdgeFunctionError(fnErr, "Account creation failed");
        throw new Error(`Staff record saved, but the login account failed: ${msg}`);
      }
      const first = (acc as any)?.created?.[0];
      const failure = (acc as any)?.errors?.[0];
      if (!first) {
        throw new Error(
          `Staff record saved, but no login account was created${failure?.error ? `: ${failure.error}` : ""}.`,
        );
      }
      return {
        username: first.username,
        password: first.password,
        name: `${inserted.first_name} ${inserted.last_name}`,
        staffId: inserted.staff_id,
      };
    },
    onSuccess: (res) => {
      setCreated(res);
      reset();
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["staff-roster"] });
      qc.invalidateQueries({ queryKey: ["unit-dashboard"] });
      qc.invalidateQueries({ queryKey: ["unit-staff-directory"] });
      toast.success(`${res.name} added and account created`);
    },
    onError: (e: any) => toast.error(e.message || "Could not add staff member"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" aria-hidden="true" /> Add staff member
          </DialogTitle>
          <DialogDescription>
            For personnel missing from the bulk-uploaded list. The record uses the same structure as
            a bulk upload and a login account is created immediately.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <Alert>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Account created for {created.name}</AlertTitle>
            <AlertDescription className="space-y-2">
              <div className="font-mono text-sm">
                <div>Staff ID: {created.staffId}</div>
                <div>Email: {created.username}@gis.local</div>
                <div>Temporary password: {created.password}</div>
              </div>
              <p className="text-xs">
                Share these credentials with the officer — the password must be changed at first sign-in.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${created.name} · ${created.username}@gis.local · ${created.password}`,
                  );
                  toast.success("Credentials copied");
                }}
              >
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" /> Copy credentials
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="add-staff-id">Staff ID *</Label>
              <Input id="add-staff-id" value={staffId} onChange={(e) => setStaffId(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="add-ghana-card">Ghana Card</Label>
              <Input id="add-ghana-card" placeholder="GHA-123456789-0" value={ghanaCard} onChange={(e) => setGhanaCard(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="add-first">First name *</Label>
              <Input id="add-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="add-last">Last name *</Label>
              <Input id="add-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="add-phone">Phone</Label>
              <GhanaPhoneInput id="add-phone" value={phone} onChange={setPhone} />
            </div>
            <div>
              <Label htmlFor="add-gender">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="add-gender"><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="add-rank">Rank</Label>
              <Select value={rankId} onValueChange={setRankId}>
                <SelectTrigger id="add-rank"><SelectValue placeholder="Select rank" /></SelectTrigger>
                <SelectContent>
                  {(ranks as any[]).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="add-dept">Department</Label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger id="add-dept"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {(departments as any[]).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="add-org-unit">Command / Unit *</Label>
              <Select value={orgUnitId} onValueChange={setOrgUnitId}>
                <SelectTrigger id="add-org-unit"><SelectValue placeholder="Select command or unit" /></SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{orgUnitPath(units, u.id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="add-role">Designated role *</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="add-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROSTER_ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="add-unit-text">Sub-unit / office</Label>
              <Input id="add-unit-text" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {created ? (
            <>
              <Button variant="outline" onClick={() => setCreated(null)}>Add another</Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              <Badge variant="outline" className="mr-auto self-center text-xs">
                Creates profile + login account
              </Badge>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Add staff member
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UnitAddStaffDialog;
