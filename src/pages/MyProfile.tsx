import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCog, Save, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { GhanaCardInput, isValidGhanaCard } from "@/components/shared/GhanaCardInput";
import { logAdminAudit } from "@/lib/admin-audit";

const EDITABLE_FIELDS = [
  "first_name", "last_name", "gender", "date_of_birth", "marital_status", "phone", "email", "ghana_card_number",
  "blood_group", "office", "training_designation", "staff_category", "photo_url",
] as const;

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
  });

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
        .select("*, reviewer:reviewer_id(first_name, last_name)")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.id,
  });

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
        subtitle="Update your personal details. Changes sync across the system in real time."
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
          <CardDescription className="text-xs">Update your name, contact, and personal info.</CardDescription>
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
            <div><Label>Date of birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
            <div>
              <Label>Marital status</Label>
              <Select value={form.marital_status || ""} onValueChange={(v) => setForm({ ...form, marital_status: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {["Single","Married","Divorced","Widowed","Separated"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0XXXXXXXXX" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Ghana Card number</Label><GhanaCardInput value={form.ghana_card_number} onChange={(v) => setForm({ ...form, ghana_card_number: v })} /></div>
            <div><Label>Office</Label><Input value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} /></div>
            <div><Label>Training designation</Label><Input value={form.training_designation} onChange={(e) => setForm({ ...form, training_designation: e.target.value })} /></div>
            <div><Label>Staff category</Label><Input value={form.staff_category} onChange={(e) => setForm({ ...form, staff_category: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Photo URL</Label><Input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} placeholder="https://…" /></div>
          </div>

          <div className="flex gap-2 flex-wrap pt-2">
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="gap-1">
              <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["my-profile-self-edit"] })} className="gap-1">
              <RefreshCw className="h-4 w-4" /> Reload
            </Button>
            {dirty && <span className="text-xs text-amber-600 self-center">Unsaved changes</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
