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

const EDITABLE_FIELDS = [
  "first_name", "last_name", "gender", "date_of_birth", "phone", "email", "ghana_card_number",
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
    first_name: "", last_name: "", gender: "", date_of_birth: "", phone: "", email: "",
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

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("Profile not loaded");
      const payload: any = {};
      EDITABLE_FIELDS.forEach((k) => {
        const v = (form[k] ?? "").toString().trim();
        payload[k] = v === "" ? null : v;
      });
      const { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated — changes synced to the system.");
      qc.invalidateQueries({ queryKey: ["my-profile-self-edit"] });
      qc.invalidateQueries({ queryKey: ["my-profile-excuse"] });
      qc.invalidateQueries({ queryKey: ["my-profile-mysubs"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update profile"),
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
      <div className="relative overflow-hidden rounded-xl border border-emerald-700/20 bg-gradient-to-r from-emerald-900 via-emerald-700 to-teal-600 p-5 shadow-md">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="rounded-lg bg-white/15 backdrop-blur p-2.5 ring-1 ring-white/20">
            <UserCog className="h-7 w-7 text-white" />
          </div>
          <div className="text-white">
            <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
            <p className="text-xs text-white/80">Update your personal details. Changes sync across the system in real time.</p>
          </div>
        </div>
      </div>

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
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0XXXXXXXXX" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Ghana Card number</Label><Input value={form.ghana_card_number} onChange={(e) => setForm({ ...form, ghana_card_number: e.target.value })} placeholder="GHA-XXXXXXXXX-X" /></div>
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
