/**
 * CREATE STAFF ACCOUNT — full-screen version of the Unit Dashboard "Add
 * staff" flow, so authorised administrators can set up one new staff member
 * with their Command, designated role and a temporary password in a single
 * step instead of creating records and accounts separately.
 *
 * The profile insert mirrors the Staff / Employees page, duplicate staff IDs
 * and Ghana Cards are checked up front, and the login account is provisioned
 * through the same staff-admin edge function used by bulk onboarding — the
 * server re-validates admin authority, command scope, role and password.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { validateGhanaPhone } from "@/lib/ghana-phone";
import { GhanaPhoneInput } from "@/components/ui/ghana-phone-input";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { orgUnitPath } from "@/lib/org-hierarchy";
import { useOrgUnits } from "@/hooks/useOrgScope";
import { ROSTER_ASSIGNABLE_ROLES } from "@/hooks/useStaffRoster";
import { roleLabel } from "@/lib/role-labels";
import { PasswordStrength } from "@/components/ui/password-strength";
import { describePolicy, usePasswordPolicy } from "@/lib/password-policy";
import { buildProfilePayload, validateStaffAccountForm, type StaffAccountForm } from "@/lib/staff-account";

type Created = { username: string; password: string; name: string; staffId: string };

/** Human-friendly temporary password (mirrors the 12-char generated shape). */
function suggestPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!?#@";
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const all = upper + lower + digits;
  while (chars.length < 12) chars.push(pick(all));
  // Fisher–Yates shuffle with CSPRNG
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const EMPTY: StaffAccountForm = {
  staffId: "", firstName: "", lastName: "", gender: "",
  phone: "", ghanaCard: "", orgUnitId: "", role: "staff", password: "",
};

export default function CreateStaffAccount() {
  const qc = useQueryClient();
  const policy = usePasswordPolicy();
  const [form, setForm] = useState<StaffAccountForm>(EMPTY);
  const [rankId, setRankId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [unit, setUnit] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const set = <K extends keyof StaffAccountForm>(key: K, value: StaffAccountForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { data: units = [], isLoading: unitsLoading } = useOrgUnits();

  const { data: ranks = [] } = useQuery({
    queryKey: ["ranks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ranks").select("*").order("level", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const unitOptions = useMemo(
    () => [...units].sort((a, b) => orgUnitPath(units, a.id).localeCompare(orgUnitPath(units, b.id))),
    [units],
  );

  const save = useMutation({
    mutationFn: async (): Promise<Created> => {
      const invalid = validateStaffAccountForm(form, policy);
      if (invalid) throw new Error(invalid);

      let localPhone: string | null = null;
      if (form.phone.trim()) {
        const res = validateGhanaPhone(form.phone);
        if (!res.valid) throw new Error(`Invalid phone "${form.phone}" — ${res.error}`);
        localPhone = res.local || form.phone.trim();
      }

      // ── Duplicate validation (staff ID is uniquely indexed; Ghana Card is not)
      const { data: dupeId } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id")
        .eq("staff_id", form.staffId.trim())
        .maybeSingle();
      if (dupeId) {
        throw new Error(
          `Staff ID ${dupeId.staff_id} already belongs to ${dupeId.first_name} ${dupeId.last_name} — open their record instead of creating a duplicate.`,
        );
      }
      if (form.ghanaCard.trim()) {
        const { data: dupeCard } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, staff_id")
          .eq("ghana_card_number", form.ghanaCard.trim())
          .maybeSingle();
        if (dupeCard) {
          throw new Error(
            `That Ghana Card is already on record for ${dupeCard.first_name} ${dupeCard.last_name} (${dupeCard.staff_id}).`,
          );
        }
      }

      const { data: inserted, error } = await supabase
        .from("profiles")
        .insert(buildProfilePayload(form, { rankId, departmentId: deptId, unit, phoneLocal: localPhone }))
        .select("id, staff_id, first_name, last_name")
        .single();
      if (error) {
        if ((error as any).code === "23505") {
          throw new Error("A staff member with that Staff ID already exists.");
        }
        throw error;
      }

      // ── Login account + designated role + admin-chosen temporary password
      const { data: acc, error: fnErr } = await supabase.functions.invoke("bulk-create-accounts", {
        body: { profile_ids: [inserted.id], role: form.role, password: form.password },
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
        password: form.password,
        name: `${inserted.first_name} ${inserted.last_name}`,
        staffId: inserted.staff_id,
      };
    },
    onSuccess: (res) => {
      setCreated(res);
      setForm(EMPTY);
      setRankId(""); setDeptId(""); setUnit("");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["staff-roster"] });
      qc.invalidateQueries({ queryKey: ["unit-dashboard"] });
      qc.invalidateQueries({ queryKey: ["unit-staff-directory"] });
      toast.success(`${res.name} added and account created`);
    },
    onError: (e: any) => toast.error(e.message || "Could not create staff account"),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UserPlus className="h-6 w-6 text-primary" aria-hidden="true" /> Create Staff Account
        </h1>
        <p className="text-sm text-muted-foreground">
          Set up a new staff member with their Command, designated role and a temporary password in one
          step. Bulk setup stays under{" "}
          <Link to="/settings" className="underline">System Settings</Link>.
        </p>
      </div>

      {created ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" /> Account created
            </CardTitle>
            <CardDescription>
              Share these credentials with {created.name} — the password must be changed at first sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>{created.name}</AlertTitle>
              <AlertDescription className="font-mono text-sm space-y-1">
                <div>Staff ID: {created.staffId}</div>
                <div>Email: {created.username}@gis.local</div>
                <div>Temporary password: {created.password}</div>
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button
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
              <Button variant="outline" onClick={() => setCreated(null)}>Create another account</Button>
              <Button asChild>
                <Link to="/staff">Open Staff / Employees</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>New staff member</CardTitle>
            <CardDescription>
              The record uses the same structure as the Staff / Employees page and a login account is
              created immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="csa-staff-id">Staff ID *</Label>
                <Input id="csa-staff-id" value={form.staffId} onChange={(e) => set("staffId", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="csa-ghana-card">Ghana Card</Label>
                <Input id="csa-ghana-card" placeholder="GHA-123456789-0" value={form.ghanaCard} onChange={(e) => set("ghanaCard", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="csa-first">First name *</Label>
                <Input id="csa-first" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="csa-last">Last name *</Label>
                <Input id="csa-last" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="csa-phone">Phone</Label>
                <GhanaPhoneInput id="csa-phone" value={form.phone} onChange={(v) => set("phone", v)} />
              </div>
              <div>
                <Label htmlFor="csa-gender">Sex</Label>
                <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                  <SelectTrigger id="csa-gender"><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="csa-rank">Rank</Label>
                <Select value={rankId} onValueChange={setRankId}>
                  <SelectTrigger id="csa-rank"><SelectValue placeholder="Select rank" /></SelectTrigger>
                  <SelectContent>
                    {(ranks as any[]).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="csa-dept">Department</Label>
                <Select value={deptId} onValueChange={setDeptId}>
                  <SelectTrigger id="csa-dept"><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {(departments as any[]).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="csa-org-unit">Command / Unit *</Label>
                <Select value={form.orgUnitId} onValueChange={(v) => set("orgUnitId", v)} disabled={unitsLoading}>
                  <SelectTrigger id="csa-org-unit">
                    <SelectValue placeholder={unitsLoading ? "Loading commands…" : "Select command or unit"} />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{orgUnitPath(units, u.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="csa-role">Designated role *</Label>
                <Select value={form.role} onValueChange={(v) => set("role", v)}>
                  <SelectTrigger id="csa-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROSTER_ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="csa-unit-text">Sub-unit / office</Label>
                <Input id="csa-unit-text" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="csa-password">Temporary password *</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="csa-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { set("password", suggestPassword()); setShowPassword(true); }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Suggest
                  </Button>
                </div>
                <PasswordStrength password={form.password} />
                <p className="text-xs text-muted-foreground">
                  Required: {describePolicy(policy).join("; ")}. Staff must change this password at first sign-in.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Badge variant="outline" className="mr-auto text-xs">
                Creates profile + login account
              </Badge>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Create staff account
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
