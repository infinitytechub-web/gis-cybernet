import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AgeDisplay } from "@/components/ui/age-display";
import { DATE_FORMAT_HINT, formatDateTime } from "@/lib/date-format";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCog, Save, Lock, RefreshCw, FileDown, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { GhanaCardInput, isValidGhanaCard } from "@/components/shared/GhanaCardInput";
import { GhanaPhoneInput } from "@/components/ui/ghana-phone-input";
import { validateGhanaPhoneList } from "@/lib/ghana-phone";
import { logAdminAudit } from "@/lib/admin-audit";
import { DateInput } from "@/components/ui/date-input";
import { BiometricSettings } from "@/components/settings/BiometricSettings";
import StaffMfaSettings from "@/components/settings/StaffMfaSettings";
import MyTrustedDevices from "@/components/settings/MyTrustedDevices";


const EDITABLE_FIELDS = [
  "first_name", "last_name", "gender", "date_of_birth", "marital_status", "phone", "email", "ghana_card_number",
  "blood_group", "office", "training_designation", "staff_category", "photo_url",
  // Bio-data self-service (sections B–D and G of the personnel form)
  "other_names", "place_of_birth", "hometown", "region_of_origin",
  "current_place_of_stay", "residential_address", "digital_address", "postal_address",
  "residential_phone", "height_cm", "uniform_size", "shoe_size", "religion",
  "hobbies", "special_skills", "number_of_children",
  "previous_last_position", "previous_reason_for_leaving",
] as const;

/** Bio-data fields rendered in the self-service section, in form order. */
const BIODATA_FIELDS: Array<{ key: EditableKey; label: string; wide?: boolean; multiline?: boolean }> = [
  { key: "other_names", label: "Other name(s)" },
  { key: "place_of_birth", label: "Place of birth" },
  { key: "hometown", label: "Hometown" },
  { key: "region_of_origin", label: "Region of origin" },
  { key: "current_place_of_stay", label: "Current place of stay" },
  { key: "digital_address", label: "Digital address (GhanaPost GPS)" },
  { key: "residential_address", label: "Residential address", wide: true },
  { key: "postal_address", label: "Postal address", wide: true },
  { key: "residential_phone", label: "Residential telephone" },
  { key: "height_cm", label: "Height (cm)" },
  { key: "uniform_size", label: "Uniform size (S–XXL)" },
  { key: "shoe_size", label: "Shoe size" },
  { key: "religion", label: "Religion" },
  { key: "number_of_children", label: "Number of children" },
  { key: "hobbies", label: "Hobbies / interests", wide: true, multiline: true },
  { key: "special_skills", label: "Special skill(s)", wide: true, multiline: true },
  { key: "previous_last_position", label: "Last position at previous employer", wide: true },
  { key: "previous_reason_for_leaving", label: "Reason for leaving previous employer", wide: true },
];

/** Restricted sections: staff may request a change, admins must approve it. */
const RESTRICTED_FIELDS: Array<{ key: string; label: string; multiline?: boolean }> = [
  { key: "medical.medical_conditions", label: "Medical condition(s) / allergy(ies)", multiline: true },
  { key: "medical.welfare_notes", label: "Additional medical / welfare notes", multiline: true },
  { key: "bank.bank_name", label: "Bank name" },
  { key: "bank.branch", label: "Branch" },
  { key: "bank.account_number", label: "Account number" },
];

type EditableKey = typeof EDITABLE_FIELDS[number];

const LOCKED_FIELDS: { key: string; label: string }[] = [
  { key: "staff_id", label: "Staff ID" },
  { key: "rank", label: "Rank" },
  { key: "department", label: "Department" },
  { key: "shift_group", label: "Shift Group" },
  { key: "unit", label: "Unit" },
  { key: "status", label: "Status" },
];

export default function MyProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<EditableKey, string>>({
    first_name: "", last_name: "", gender: "", date_of_birth: "", marital_status: "", phone: "", email: "",
    ghana_card_number: "", blood_group: "", office: "", training_designation: "",
    staff_category: "", photo_url: "",
    other_names: "", place_of_birth: "", hometown: "", region_of_origin: "",
    current_place_of_stay: "", residential_address: "", digital_address: "", postal_address: "",
    residential_phone: "", height_cm: "", uniform_size: "", shoe_size: "", religion: "",
    hobbies: "", special_skills: "", number_of_children: "",
    previous_last_position: "", previous_reason_for_leaving: "",
  });
  const [restricted, setRestricted] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile-self-edit", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*, ranks(name, abbreviation), departments(name)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!profile) return;
    const next = { ...form };
    EDITABLE_FIELDS.forEach((k) => { (next as any)[k] = (profile as any)[k] ?? ""; });
    setForm(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Realtime: refresh on any change to my profile row.
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`my-profile-${profile.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-profile-self-edit"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, qc]);

  const dirty = useMemo(() => {
    if (!profile) return false;
    return EDITABLE_FIELDS.some((k) => (form[k] ?? "") !== ((profile as any)[k] ?? ""));
  }, [form, profile]);

  // Pending change requests submitted by this user
  const { data: myRequests } = useQuery({
    queryKey: ["my-profile-change-requests", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("profile_change_requests")
        .select("*")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.id,
  });

  // Deep-link: highlight a specific request from email/notification
  const [searchParams] = useSearchParams();
  const focusRequestId = searchParams.get("request");
  const requestRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusRequestId || !myRequests?.length) return;
    const el = requestRefs.current[focusRequestId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(focusRequestId);
      const t = setTimeout(() => setHighlightedId(null), 3500);
      return () => clearTimeout(t);
    }
  }, [focusRequestId, myRequests]);
  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !user) throw new Error("Profile not loaded");
      const gcn = (form.ghana_card_number ?? "").trim();
      if (gcn && !isValidGhanaCard(gcn)) {
        await logAdminAudit("ghana_card_verification", "mismatch", {
          staff_id: profile.staff_id ?? null,
          attempted_value: gcn,
          context: "my_profile_self_edit",
          reason: "format_invalid",
        }, profile.id);
        throw new Error("Ghana Card must be in the format GHA-XXXXXXXXX-X (9 digits, dash, 1 digit)");
      }
      const phoneCheck = validateGhanaPhoneList(form.phone ?? "");
      if (!phoneCheck.valid) {
        throw new Error(`Invalid phone number — ${phoneCheck.errors[0]}`);
      }
      // Build a diff of only changed fields
      const requested: Record<string, string | null> = {};
      const previous: Record<string, string | null> = {};
      EDITABLE_FIELDS.forEach((k) => {
        const next = (form[k] ?? "").toString().trim();
        const curr = ((profile as any)[k] ?? "").toString();
        if (next !== curr) {
          requested[k] = next === "" ? null : next;
          previous[k] = curr === "" ? null : curr;
        }
      });
      if (Object.keys(requested).length === 0) throw new Error("No changes to submit");
      const { error } = await supabase.from("profile_change_requests").insert({
        profile_id: profile.id,
        user_id: user.id,
        requested_changes: requested,
        previous_values: previous,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Change request submitted — awaiting Command / Admin approval.");
      qc.invalidateQueries({ queryKey: ["my-profile-change-requests"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to submit change request"),
  });

  const cancelRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("profile_change_requests")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request cancelled.");
      qc.invalidateQueries({ queryKey: ["my-profile-change-requests"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to cancel"),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground p-6">Loading your profile…</div>;
  if (!profile) return <div className="text-sm text-muted-foreground p-6">Profile not found.</div>;

  const lockedValues: Record<string, string> = {
    staff_id: profile.staff_id ?? "—",
    rank: profile.ranks?.abbreviation || profile.ranks?.name || "—",
    department: profile.departments?.name ?? "—",
    shift_group: profile.shift_group ? `Shift ${profile.shift_group}` : "—",
    unit: profile.unit ?? "—",
    status: profile.status ?? "—",
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={UserCog}
        title="My Profile"
        subtitle="Submit profile changes for review. Edits take effect after Command / Admin approval."
      />

      <Card className="border-l-4 border-l-amber-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Lock className="h-4 w-4 text-amber-600" /> Read-only fields</CardTitle>
          <CardDescription className="text-xs">These details are managed by Admin / Command — contact them to request a change.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
            {LOCKED_FIELDS.map(f => (
              <div key={f.key}>
                <div className="text-muted-foreground">{f.label}</div>
                <div className="font-medium">{lockedValues[f.key]}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Editable details</CardTitle>
          <CardDescription className="text-xs">
            Edits are submitted for Command / Admin approval before they appear in the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div><Label>First name</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Last name</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender || ""} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Blood group</Label>
              <Select value={form.blood_group || ""} onValueChange={(v) => setForm({ ...form, blood_group: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><div className="flex items-center justify-between gap-2 mb-1"><Label>Date of birth ({DATE_FORMAT_HINT})</Label><AgeDisplay dob={form.date_of_birth} /></div><DateInput  value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
            <div>
              <Label>Marital status</Label>
              <Select value={form.marital_status || ""} onValueChange={(v) => setForm({ ...form, marital_status: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {["Single","Married","Divorced","Widowed","Separated"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="my-phone">Phone</Label><GhanaPhoneInput id="my-phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Ghana Card number</Label><GhanaCardInput value={form.ghana_card_number} onChange={(v) => setForm({ ...form, ghana_card_number: v })} /></div>
            <div><Label>Office</Label><Input value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} /></div>
            <div><Label>Training designation</Label><Input value={form.training_designation} onChange={(e) => setForm({ ...form, training_designation: e.target.value })} /></div>
            <div><Label>Staff category</Label><Input value={form.staff_category} onChange={(e) => setForm({ ...form, staff_category: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Photo URL</Label><Input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} placeholder="https://…" /></div>
          </div>

          <div className="flex gap-2 flex-wrap pt-2">
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="gap-1">
              <Save className="h-4 w-4" /> {save.isPending ? "Submitting…" : "Submit for approval"}
            </Button>
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["my-profile-self-edit"] })} className="gap-1">
              <RefreshCw className="h-4 w-4" /> Reload
            </Button>
            {dirty && <span className="text-xs text-amber-600 self-center">Unsaved changes</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">My change requests</CardTitle>
          <CardDescription className="text-xs">Recent profile edits you submitted and their review status.</CardDescription>
        </CardHeader>
        <CardContent>
          {!myRequests || myRequests.length === 0 ? (
            <p className="text-xs text-muted-foreground">No change requests yet.</p>
          ) : (
            <div className="space-y-2">
              {myRequests.map((r: any) => (
                <div
                  key={r.id}
                  ref={(el) => { requestRefs.current[r.id] = el; }}
                  className={`rounded border p-2 text-xs space-y-1 transition-all ${
                    highlightedId === r.id ? "ring-2 ring-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${
                      r.status === "approved" ? "bg-emerald-100 text-emerald-800" :
                      r.status === "rejected" ? "bg-red-100 text-red-800" :
                      r.status === "cancelled" ? "bg-muted text-muted-foreground" :
                      "bg-amber-100 text-amber-800"
                    }`}>{r.status}</span>
                    <span className="text-muted-foreground">{formatDateTime(r.created_at)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    Fields: <span className="font-medium text-foreground">{Object.keys(r.requested_changes || {}).join(", ") || "—"}</span>
                  </div>
                  {r.reviewer_notes && (
                    <div className="text-muted-foreground">Reviewer notes: <span className="text-foreground">{r.reviewer_notes}</span></div>
                  )}
                  {r.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => cancelRequest.mutate(r.id)} disabled={cancelRequest.isPending}>
                      Cancel request
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <StaffMfaSettings />

      <MyTrustedDevices />

      <BiometricSettings />
    </div>

  );
}
