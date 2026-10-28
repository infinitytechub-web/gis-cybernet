import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileUploadGuard } from "@/components/security/FileUploadGuard";
import { OffencesMultiSelect } from "./OffencesMultiSelect";
import { StaffPicker } from "./StaffPicker";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

const BUCKET = "detention-photos";
const MIN_SURETIES = 2;

export const scanLabel = (s: string) =>
  s === "safe" ? "Scanned – safe" : s === "infected" ? "Quarantined" : "Checked – pending virus scan";

export async function upload(path: string, file: File) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}
async function openFile(path: string, status: string) {
  if (status === "infected") return alert("This file is quarantined and cannot be opened.");
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function useErr() {
  const { toast } = useToast();
  return (e: unknown, ok?: string) =>
    e ? toast({ title: "Not saved", description: (e as Error).message ?? String(e), variant: "destructive" }) : ok && toast({ title: ok });
}

export function OffencesTab({ id }: { id: string }) {
  const qc = useQueryClient(); const err = useErr();
  const { data = [] } = useQuery({ queryKey: ["suspect_offences", id], queryFn: async () =>
    ((await supabase.from("suspect_offences").select("offence").eq("detention_id", id)).data ?? []).map((r) => r.offence) });
  const [v, setV] = useState<string[]>([]);
  useEffect(() => setV(data), [data]);
  const save = async () => {
    const del = data.filter((o) => !v.includes(o)); const add = v.filter((o) => !data.includes(o));
    let e: unknown = null;
    if (del.length) e = (await supabase.from("suspect_offences").delete().eq("detention_id", id).in("offence", del)).error;
    if (!e && add.length) e = (await supabase.from("suspect_offences").insert(add.map((offence) => ({ detention_id: id, offence })))).error;
    err(e, "Offences saved"); qc.invalidateQueries({ queryKey: ["suspect_offences", id] }); qc.invalidateQueries({ queryKey: ["hub_offences"] });
  };
  return <div className="space-y-3"><OffencesMultiSelect value={v} onChange={setV} /><Button onClick={save}>Save offences</Button></div>;
}

export function MugshotTab({ id }: { id: string }) {
  const qc = useQueryClient(); const err = useErr();
  const { data } = useQuery({ queryKey: ["mugshot", id], queryFn: async () => {
    const r = (await supabase.from("detention_records").select("mugshot_url").eq("id", id).single()).data;
    if (!r?.mugshot_url) return null;
    return (await supabase.storage.from(BUCKET).createSignedUrl(r.mugshot_url, 300)).data?.signedUrl ?? null; } });
  return (
    <div className="space-y-3">
      {data ? <img src={data} alt="Suspect mug-shot" className="h-48 rounded-md border object-cover" /> : <p className="text-sm text-muted-foreground">No mug-shot yet.</p>}
      <FileUploadGuard accept="image/jpeg,image/png,image/webp" buttonLabel="Upload mug-shot" onAccept={async ([f]) => {
        try { const p = await upload(`suspects/${id}/mugshot-${Date.now()}.${f.name.split(".").pop()}`, f);
          err((await supabase.from("detention_records").update({ mugshot_url: p }).eq("id", id)).error, "Mug-shot uploaded");
          qc.invalidateQueries({ queryKey: ["mugshot", id] }); } catch (e) { err(e); } }} />
    </div>
  );
}

export function DocumentsTab({ id }: { id: string }) {
  const qc = useQueryClient(); const err = useErr();
  const { data = [] } = useQuery({ queryKey: ["suspect_docs", id], queryFn: async () =>
    (await supabase.from("suspect_documents").select("*").eq("detention_id", id).order("created_at", { ascending: false })).data ?? [] });
  return (
    <div className="space-y-3">
      <FileUploadGuard multiple accept="application/pdf,image/jpeg,image/png" buttonLabel="Upload documents" onAccept={async (files) => {
        for (const f of files) { try { const p = await upload(`suspects/${id}/docs/${Date.now()}-${f.name}`, f);
          err((await supabase.from("suspect_documents").insert({ detention_id: id, file_path: p, file_name: f.name })).error); } catch (e) { err(e); } }
        qc.invalidateQueries({ queryKey: ["suspect_docs", id] }); }} />
      {data.map((d) => (
        <div key={d.id} className="flex items-center justify-between rounded border p-2 text-sm">
          <button className="truncate text-left underline" onClick={() => openFile(d.file_path, d.scan_status)}>{d.file_name}</button>
          <Badge variant={d.scan_status === "infected" ? "destructive" : "secondary"}>{scanLabel(d.scan_status)}</Badge>
        </div>
      ))}
    </div>
  );
}

const emptySurety = { full_name: "", relationship: "", id_type: "", id_number: "", phone: "", address: "", occupation: "" };
export function SuretiesTab({ id }: { id: string }) {
  const qc = useQueryClient(); const err = useErr();
  const { data: bails = [] } = useQuery({ queryKey: ["bails_for", id], queryFn: async () =>
    (await supabase.from("detention_bail_records").select("id,reference,offence").eq("detention_id", id).is("deleted_at", null)).data ?? [] });
  const bailId = bails[0]?.id;
  const { data: sureties = [] } = useQuery({ enabled: !!bailId, queryKey: ["sureties", bailId], queryFn: async () =>
    (await supabase.from("detention_sureties").select("*").eq("bail_id", bailId!).order("created_at")).data ?? [] });
  const [draft, setDraft] = useState(emptySurety);
  const [photo, setPhoto] = useState<File | null>(null);
  if (!bailId) return <p className="text-sm text-muted-foreground">Create a bail record for this suspect first, then add sureties here.</p>;
  const add = async () => {
    if (!draft.full_name.trim() || !draft.phone.trim()) return err(new Error("Surety name and phone are required"));
    try {
      const photo_path = photo ? await upload(`bail/${bailId}/sureties/${Date.now()}-${photo.name}`, photo) : null;
      err((await supabase.from("detention_sureties").insert({ ...draft, bail_id: bailId, photo_path })).error, "Surety added");
      setDraft(emptySurety); setPhoto(null); qc.invalidateQueries({ queryKey: ["sureties", bailId] });
    } catch (e) { err(e); }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm">Bail {bails[0].reference} · Offence: <b>{bails[0].offence || "—"}</b></p>
      <Badge variant={sureties.length >= MIN_SURETIES ? "secondary" : "destructive"}>{sureties.length} of {MIN_SURETIES} required sureties</Badge>
      {sureties.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded border p-2 text-sm">
          <span>{s.full_name} · {s.relationship} · {s.phone}</span>
          <div className="flex gap-2">
            {s.photo_path && <Button size="sm" variant="outline" onClick={() => openFile(s.photo_path!, s.scan_status)}>Photo</Button>}
            <Button size="icon" variant="ghost" aria-label="Remove surety" onClick={async () => { err((await supabase.from("detention_sureties").delete().eq("id", s.id)).error); qc.invalidateQueries({ queryKey: ["sureties", bailId] }); }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        {(Object.keys(emptySurety) as (keyof typeof emptySurety)[]).map((k) => (
          <Input key={k} placeholder={k.replace("_", " ")} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
        ))}
        <FileUploadGuard accept="image/jpeg,image/png,image/webp" buttonLabel={photo ? `Photo: ${photo.name}` : "Surety photo"} onAccept={([f]) => setPhoto(f)} />
        <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Add surety</Button>
      </div>
    </div>
  );
}

function RepatriationTab({ id }: { id: string }) {
  const qc = useQueryClient(); const err = useErr();
  const { data } = useQuery({ queryKey: ["repat", id], queryFn: async () =>
    (await supabase.from("repatriation_details").select("*").eq("detention_id", id).maybeSingle()).data });
  const [vehicles, setVehicles] = useState(""); const [weapons, setWeapons] = useState("");
  const [destination, setDestination] = useState(""); const [officers, setOfficers] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => { if (data) { setVehicles(data.vehicles.join(", ")); setWeapons(data.weapons.join(", ")); setDestination(data.destination ?? "");
    setOfficers(data.officer_ids.map((o) => ({ id: o, label: o.slice(0, 8) }))); } }, [data]);
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    const row = { detention_id: id, vehicles: list(vehicles), weapons: list(weapons), destination, officer_ids: officers.map((o) => o.id), updated_at: new Date().toISOString() };
    err((await supabase.from("repatriation_details").upsert(row, { onConflict: "detention_id" })).error, "Repatriation details saved");
    qc.invalidateQueries({ queryKey: ["repat", id] });
  };
  return (
    <div className="space-y-3">
      <OffencesTab id={id} />
      <Input placeholder="Vehicles involved (comma separated, e.g. GR-1234-22)" value={vehicles} onChange={(e) => setVehicles(e.target.value)} />
      <Input placeholder="Weapons used (comma separated)" value={weapons} onChange={(e) => setWeapons(e.target.value)} />
      <Input placeholder="Destination / border post" value={destination} onChange={(e) => setDestination(e.target.value)} />
      <div className="space-y-1">
        <p className="text-sm font-medium">Officers involved: {officers.length}</p>
        <div className="flex flex-wrap gap-1">{officers.map((o) => <Badge key={o.id} variant="secondary">{o.label}<button className="ml-1" onClick={() => setOfficers(officers.filter((x) => x.id !== o.id))}>×</button></Badge>)}</div>
        <StaffPicker value={null} label={null} title="Add officer" placeholder="Add officer from command list…" onChange={(sid, lbl) => sid && !officers.some((o) => o.id === sid) && setOfficers([...officers, { id: sid, label: lbl ?? sid }])} />
      </div>
      <Button onClick={save}>Save repatriation details</Button>
    </div>
  );
}

function ApprovalsTab({ id, workflow }: { id: string; workflow: "bail" | "repatriation" }) {
  const qc = useQueryClient(); const err = useErr();
  const { data: tiers = [] } = useQuery({ queryKey: ["chain", workflow], queryFn: async () =>
    (await supabase.from("approval_chain_config").select("*").eq("workflow", workflow).order("tier")).data ?? [] });
  const { data: signed = [] } = useQuery({ queryKey: ["recs", workflow, id], queryFn: async () =>
    (await supabase.from("approval_recommendations").select("*").eq("workflow", workflow).eq("record_id", id).order("tier")).data ?? [] });
  const next = tiers.find((t) => !signed.some((s) => s.tier === t.tier));
  const [comments, setComments] = useState(""); const [name, setName] = useState("");
  const sign = async (decision: string) => {
    if (!next) return;
    const { error } = await supabase.rpc("sign_approval", { _workflow: workflow, _record_id: id, _tier: next.tier, _decision: decision, _comments: comments, _signer_name: name });
    err(error, "Signed"); if (!error) { setComments(""); setName(""); }
    qc.invalidateQueries({ queryKey: ["recs", workflow, id] });
  };
  return (
    <div className="space-y-3">
      {tiers.map((t) => { const s = signed.find((x) => x.tier === t.tier); return (
        <div key={t.id} className="rounded border p-2 text-sm">
          <b>Tier {t.tier}: {t.label}</b> <span className="text-muted-foreground">({t.role})</span>
          {s ? <p>{s.decision.replace("_", " ")} by <i>{s.signer_name}</i> on {new Date(s.signed_at).toLocaleString("en-GB")}{s.comments ? ` — ${s.comments}` : ""}<br /><span className="font-mono text-xs text-muted-foreground">Signature {s.signature_hash.slice(0, 16)}…</span></p>
            : <p className="text-muted-foreground">Awaiting</p>}
        </div>); })}
      {next && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Your step: {next.label}</p>
          <Textarea placeholder="Recommendation / comments" value={comments} onChange={(e) => setComments(e.target.value)} />
          <Input placeholder="Type your full name as e-signature" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            {next.tier < 3 ? <><Button onClick={() => sign("recommend")} disabled={!name.trim()}>Recommend & sign</Button><Button variant="outline" onClick={() => sign("not_recommend")} disabled={!name.trim()}>Do not recommend</Button></>
              : <><Button onClick={() => sign("approve")} disabled={!name.trim()}>Approve & sign</Button><Button variant="destructive" onClick={() => sign("reject")} disabled={!name.trim()}>Reject</Button></>}
          </div>
        </div>
      )}
    </div>
  );
}

export function SuspectCasePanel({ id }: { id: string }) {
  return (
    <Tabs defaultValue="offences">
      <TabsList className="flex-wrap">
        {["offences", "mugshot", "documents", "sureties", "repatriation", "bail-approval", "repat-approval"].map((t) =>
          <TabsTrigger key={t} value={t} className="capitalize">{t.replace("-", " ")}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="offences"><OffencesTab id={id} /></TabsContent>
      <TabsContent value="mugshot"><MugshotTab id={id} /></TabsContent>
      <TabsContent value="documents"><DocumentsTab id={id} /></TabsContent>
      <TabsContent value="sureties"><SuretiesTab id={id} /></TabsContent>
      <TabsContent value="repatriation"><RepatriationTab id={id} /></TabsContent>
      <TabsContent value="bail-approval"><ApprovalsTab id={id} workflow="bail" /></TabsContent>
      <TabsContent value="repat-approval"><ApprovalsTab id={id} workflow="repatriation" /></TabsContent>
    </Tabs>
  );
}
