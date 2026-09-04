/**
 * GIS field reporting form.
 *
 * Captures a structured field report with device GPS coordinates (accuracy kept
 * for audit), region/district from the Ghana districts reference, and photo or
 * document attachments. Files go through the scanned secure-upload path and are
 * recorded as M&E evidence linked to the report, so the report lands on the
 * Command Center map with its location and supporting material.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, FileUp, ImagePlus, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadSecureFile } from "@/lib/secure-upload";
import { logAdminAudit } from "@/lib/admin-audit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const db = supabase as any;

type District = { id: string; name: string; region: string; centroid_lat: number | null; centroid_lng: number | null };
type ProjectOption = { id: string; ref_code: string | null; name: string };
type Attachment = { file: File; kind: "photo" | "document" };

const REPORT_TYPES = [
  { value: "patrol", label: "Patrol report" },
  { value: "inspection", label: "Inspection" },
  { value: "monitoring_visit", label: "Monitoring visit" },
  { value: "verification", label: "Data verification" },
  { value: "incident", label: "Incident observation" },
  { value: "community_engagement", label: "Community engagement" },
];

const CLASSIFICATIONS = ["internal", "restricted", "confidential"];

export function FieldReportForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [districts, setDistricts] = useState<District[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Record<string, any>>({
    ref_code: "",
    title: "",
    report_type: "patrol",
    summary: "",
    project_id: "",
    region: "",
    district_id: "",
    latitude: "",
    longitude: "",
    location_accuracy_m: "",
    classification: "internal",
    reported_at: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [{ data: districtRows }, { data: projectRows }] = await Promise.all([
        db.from("ghana_districts").select("id,name,region,centroid_lat,centroid_lng").order("region").order("name"),
        db.from("me_projects").select("id,ref_code,name").order("name").limit(300),
      ]);
      setDistricts(districtRows ?? []);
      setProjects(projectRows ?? []);
    })();
  }, [open]);

  const regions = useMemo(() => Array.from(new Set(districts.map((d) => d.region).filter(Boolean))).sort(), [districts]);
  const districtsInRegion = useMemo(
    () => districts.filter((d) => !form.region || d.region === form.region),
    [districts, form.region],
  );

  const captureLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("This device cannot provide a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((previous) => ({
          ...previous,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
          location_accuracy_m: Math.round(position.coords.accuracy),
        }));
        setLocating(false);
        toast.success(`Location captured (±${Math.round(position.coords.accuracy)} m)`);
      },
      (error) => {
        setLocating(false);
        toast.error(error.code === error.PERMISSION_DENIED ? "Location permission was refused. Enter the coordinates manually." : "Could not read the current location.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const useDistrictCentre = (districtId: string) => {
    const district = districts.find((d) => d.id === districtId);
    if (!district?.centroid_lat || !district?.centroid_lng) {
      toast.error("No centre point is recorded for that district.");
      return;
    }
    setForm((previous) => ({
      ...previous,
      latitude: Number(district.centroid_lat).toFixed(6),
      longitude: Number(district.centroid_lng).toFixed(6),
      location_accuracy_m: "",
    }));
  };

  const addFiles = (files: FileList | null, kind: Attachment["kind"]) => {
    if (!files) return;
    setAttachments((previous) => [...previous, ...Array.from(files).map((file) => ({ file, kind }))]);
  };

  const reset = () => {
    setForm({ ref_code: "", title: "", report_type: "patrol", summary: "", project_id: "", region: "", district_id: "", latitude: "", longitude: "", location_accuracy_m: "", classification: "internal", reported_at: new Date().toISOString().slice(0, 16) });
    setAttachments([]);
  };

  const save = async () => {
    if (!form.title.trim() || !form.summary.trim()) {
      toast.error("A title and summary are required.");
      return;
    }
    if (!form.latitude || !form.longitude) {
      toast.error("Capture or enter the report location so it appears on the map.");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const district = districts.find((d) => d.id === form.district_id);
      const payload: Record<string, any> = {
        ref_code: form.ref_code.trim() || `FR-${Date.now().toString(36).toUpperCase()}`,
        title: form.title.trim(),
        report_type: form.report_type,
        summary: form.summary.trim(),
        project_id: form.project_id || null,
        region: form.region || district?.region || null,
        district_id: form.district_id || null,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        location_accuracy_m: form.location_accuracy_m === "" ? null : Number(form.location_accuracy_m),
        classification: form.classification,
        status: "draft",
        reported_at: form.reported_at ? new Date(form.reported_at).toISOString() : new Date().toISOString(),
        submitted_by: auth.user?.id ?? null,
      };

      const { data: inserted, error } = await db.from("me_field_reports").insert(payload).select("id,ref_code").single();
      if (error) throw error;

      let uploaded = 0;
      const failures: string[] = [];
      for (const attachment of attachments) {
        try {
          const result = await uploadSecureFile(attachment.file, { maxMb: 25 });
          const { error: evidenceError } = await db.from("me_evidence").insert({
            title: attachment.file.name,
            evidence_type: attachment.kind,
            source: "field_report",
            evidence_date: new Date().toISOString().slice(0, 10),
            file_path: result.path,
            file_name: attachment.file.name,
            file_size: attachment.file.size,
            mime_type: attachment.file.type || null,
            content_hash: result.sha,
            uploaded_by: auth.user?.id ?? null,
            related_type: "field_report",
            related_id: inserted.id,
            verification_status: "pending",
            classification: form.classification,
          });
          if (evidenceError) throw evidenceError;
          uploaded += 1;
        } catch (uploadError: any) {
          failures.push(`${attachment.file.name}: ${uploadError?.message ?? "upload failed"}`);
        }
      }

      await logAdminAudit("me_field_reports", "created", { ref_code: inserted.ref_code, attachments: uploaded });
      toast.success(`Field report ${inserted.ref_code} created${uploaded ? ` with ${uploaded} attachment${uploaded === 1 ? "" : "s"}` : ""}`);
      failures.forEach((message) => toast.error(message));
      setOpen(false);
      reset();
      onSaved();
    } catch (saveError: any) {
      toast.error(saveError?.message ?? "The field report could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> New Field Report</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Capture field report</DialogTitle></DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="fr-title">Title</Label>
            <Input id="fr-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What was observed" />
          </div>
          <div>
            <Label htmlFor="fr-ref">Reference (optional)</Label>
            <Input id="fr-ref" value={form.ref_code} onChange={(event) => setForm({ ...form, ref_code: event.target.value })} placeholder="Generated if left blank" />
          </div>
          <div>
            <Label htmlFor="fr-type">Report type</Label>
            <Select value={form.report_type} onValueChange={(value) => setForm({ ...form, report_type: value })}>
              <SelectTrigger id="fr-type"><SelectValue /></SelectTrigger>
              <SelectContent>{REPORT_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="fr-summary">Summary</Label>
            <Textarea id="fr-summary" rows={4} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} placeholder="Findings, actions taken and any follow-up needed" />
          </div>
          <div>
            <Label htmlFor="fr-project">Related project</Label>
            <Select value={form.project_id || "none"} onValueChange={(value) => setForm({ ...form, project_id: value === "none" ? "" : value })}>
              <SelectTrigger id="fr-project"><SelectValue placeholder="Not linked" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.ref_code ? `${project.ref_code} · ` : ""}{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="fr-when">Reported at</Label>
            <Input id="fr-when" type="datetime-local" value={form.reported_at} onChange={(event) => setForm({ ...form, reported_at: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="fr-region">Region</Label>
            <Select value={form.region || "none"} onValueChange={(value) => setForm({ ...form, region: value === "none" ? "" : value, district_id: "" })}>
              <SelectTrigger id="fr-region"><SelectValue placeholder="Select region" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {regions.map((region) => <SelectItem key={region} value={region}>{region}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="fr-district">District</Label>
            <Select value={form.district_id || "none"} onValueChange={(value) => { const id = value === "none" ? "" : value; setForm({ ...form, district_id: id }); if (id && !form.latitude) useDistrictCentre(id); }}>
              <SelectTrigger id="fr-district"><SelectValue placeholder="Select district" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {districtsInRegion.map((district) => <SelectItem key={district.id} value={district.id}>{district.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="fr-classification">Classification</Label>
            <Select value={form.classification} onValueChange={(value) => setForm({ ...form, classification: value })}>
              <SelectTrigger id="fr-classification"><SelectValue /></SelectTrigger>
              <SelectContent>{CLASSIFICATIONS.map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <Card className="mt-2">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Location</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={captureLocation} disabled={locating}>
                  {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
                  {locating ? "Locating…" : "Use my GPS location"}
                </Button>
                {form.district_id && <Button type="button" variant="ghost" size="sm" onClick={() => useDistrictCentre(form.district_id)}>Use district centre</Button>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label htmlFor="fr-lat">Latitude</Label><Input id="fr-lat" type="number" step="0.000001" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></div>
              <div><Label htmlFor="fr-lng">Longitude</Label><Input id="fr-lng" type="number" step="0.000001" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></div>
              <div><Label htmlFor="fr-acc">Accuracy (m)</Label><Input id="fr-acc" type="number" value={form.location_accuracy_m} onChange={(event) => setForm({ ...form, location_accuracy_m: event.target.value })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Coordinates are required so the report appears on the Command Center map.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Photos and documents</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => photoInput.current?.click()}><ImagePlus className="mr-2 h-4 w-4" /> Add photos</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => docInput.current?.click()}><FileUp className="mr-2 h-4 w-4" /> Add documents</Button>
              </div>
            </div>
            <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(event) => { addFiles(event.target.files, "photo"); event.target.value = ""; }} />
            <input ref={docInput} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" multiple className="hidden" onChange={(event) => { addFiles(event.target.files, "document"); event.target.value = ""; }} />
            {attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No files attached. Photos may be taken with the device camera. Each file is scanned before it is stored, 25 MB maximum.</p>
            ) : (
              <ul className="space-y-1">
                {attachments.map((attachment, index) => (
                  <li key={`${attachment.file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><Badge variant="secondary" className="capitalize">{attachment.kind}</Badge><span className="truncate">{attachment.file.name}</span><span className="text-xs text-muted-foreground">{(attachment.file.size / 1024 / 1024).toFixed(2)} MB</span></span>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${attachment.file.name}`} onClick={() => setAttachments((previous) => previous.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save field report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
