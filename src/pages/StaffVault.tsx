import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Archive, Download, Eye, FolderLock, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { triggerDownload } from "@/lib/download-utils";
import { vaultActionLabel } from "@/lib/vault-log";
import { STAFF_VAULT_CATEGORIES, STAFF_VAULT_MAX_BYTES, staffVaultCategoryLabel, validateStaffVaultFile } from "@/lib/staff-vault";

type Person = { profile_id: string; name: string; staff_id: string | null; rank: string | null; grade: string | null; unit: string | null; is_self: boolean; file_count: number };
type VaultFile = { id: string; title: string; category: string; description: string | null; file_path: string; file_name: string; size_bytes: number | null; created_at: string; archived_at: string | null; archive_reason: string | null };

export default function StaffVault() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ title: "", category: "certificate", description: "" });
  const [busy, setBusy] = useState(false);

  const people = useQuery({ queryKey: ["staff-vault-people"], queryFn: async () => {
    const { data, error } = await supabase.rpc("staff_vault_people"); if (error) throw error; return (data ?? []) as Person[];
  } });
  const me = people.data?.find(p => p.is_self);
  const current = selected || me?.profile_id || "";
  const person = people.data?.find(p => p.profile_id === current);
  const isOwn = !!person?.is_self;

  const files = useQuery({ queryKey: ["staff-vault-files", current], enabled: !!current, queryFn: async () => {
    const { data, error } = await supabase.from("staff_vault_files").select("id,title,category,description,file_path,file_name,size_bytes,created_at,archived_at,archive_reason").eq("profile_id", current).order("created_at", { ascending: false });
    if (error) throw error; return (data ?? []) as VaultFile[];
  } });
  const log = useQuery({ queryKey: ["staff-vault-log", current], enabled: !!current, queryFn: async () => {
    const { data, error } = await supabase.rpc("staff_vault_activity", { _profile_id: current }); if (error) throw error; return data ?? [];
  } });
  const refresh = () => ["staff-vault-files", "staff-vault-log", "staff-vault-people"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));

  const shown = useMemo(() => { const t = q.trim().toLowerCase(); return (files.data ?? []).filter(f => (showArchived ? !!f.archived_at : !f.archived_at) && (!t || `${f.title} ${f.file_name} ${f.description ?? ""}`.toLowerCase().includes(t))); }, [files.data, showArchived, q]);
  const pager = usePagedList(shown);
  const logPager = usePagedList(log.data ?? []);

  const upload = async (file: File) => {
    const problem = validateStaffVaultFile(file); if (problem) return toast.error(problem);
    if (!form.title.trim()) return toast.error("Enter a title first");
    setBusy(true);
    const path = `${current}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { data: u } = await supabase.auth.getUser();
    const { error: upErr } = await supabase.storage.from("staff-vault").upload(path, file, { contentType: file.type });
    if (upErr) { setBusy(false); return toast.error(upErr.message); }
    const { error } = await supabase.from("staff_vault_files").insert({ profile_id: current, title: form.title.trim(), category: form.category, description: form.description.trim() || null, file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: u.user!.id });
    if (error) { await supabase.storage.from("staff-vault").remove([path]); setBusy(false); return toast.error(error.message); }
    setBusy(false); setForm({ title: "", category: form.category, description: "" }); toast.success("Document saved"); refresh();
  };
  const open = async (f: VaultFile, action: "preview" | "download") => {
    const { error } = await supabase.rpc("record_staff_vault_access", { _file_id: f.id, _action: action });
    if (error) return toast.error(error.message);
    const { data, error: e2 } = await supabase.storage.from("staff-vault").createSignedUrl(f.file_path, 120, action === "download" ? { download: f.file_name } : undefined);
    if (e2 || !data) return toast.error("Could not open the document");
    if (action === "download") triggerDownload(data.signedUrl, f.file_name); else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    qc.invalidateQueries({ queryKey: ["staff-vault-log"] });
  };
  const archive = async (f: VaultFile, restore: boolean) => {
    const reason = restore ? null : window.prompt(`Archive "${f.title}"? Enter a reason:`);
    if (!restore && !reason?.trim()) return;
    const { error } = await supabase.from("staff_vault_files").update(restore ? { archived_at: null } : { archived_at: new Date().toISOString(), archive_reason: reason }).eq("id", f.id);
    if (error) return toast.error(error.message); toast.success(restore ? "Restored" : "Archived"); refresh();
  };

  return <div className="space-y-4">
    <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><FolderLock className="h-5 w-5 text-primary" aria-hidden /></div>
      <div><h1 className="text-2xl font-bold">Staff Vault</h1><p className="text-sm text-muted-foreground">Your personal documents. Only you, Super Admins, and officers in your command with a higher rank and an equal or higher grade can open them.</p></div></div>

    {people.error && <p className="text-sm text-destructive">Could not load the vault.</p>}
    {people.isFetched && !me && <Card><CardContent className="py-6 text-sm text-muted-foreground">Your account is not linked to a staff record, so you have no personal vault.</CardContent></Card>}

    {(people.data?.length ?? 0) > 1 && <Card><CardContent className="grid gap-3 pt-6 md:grid-cols-2">
      <div><Label>Officer</Label><SearchableSelect value={current} onValueChange={setSelected} placeholder="Choose an officer"
        options={(people.data ?? []).map(p => ({ value: p.profile_id, label: `${p.is_self ? "My vault — " : ""}${p.name}${p.staff_id ? ` (${p.staff_id})` : ""}` }))} /></div>
      {person && <div className="text-sm"><div className="font-medium">{person.name}</div><div className="text-muted-foreground">{[person.rank, person.grade, person.unit].filter(Boolean).join(" · ")}</div><div className="text-muted-foreground">{person.file_count} active document(s)</div></div>}
    </CardContent></Card>}

    {current && <Tabs defaultValue="docs"><TabsList><TabsTrigger value="docs">Documents</TabsTrigger><TabsTrigger value="log">Log</TabsTrigger></TabsList>
      <TabsContent value="docs" className="space-y-4">
        {isOwn && <Card><CardHeader><CardTitle className="text-base">Add a document</CardTitle><CardDescription>PDF, Word, Excel, JPG or PNG, up to {STAFF_VAULT_MAX_BYTES / 1024 / 1024} MB.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div><Label htmlFor="sv-title">Title</Label><Input id="sv-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Degree certificate" /></div>
            <div><Label>Category</Label><Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STAFF_VAULT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="sv-desc">Note (optional)</Label><Input id="sv-desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="md:col-span-3"><input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
              <Button onClick={() => fileRef.current?.click()} disabled={busy || !form.title.trim()}><Upload className="mr-1 h-4 w-4" />{busy ? "Uploading…" : "Choose file and save"}</Button></div>
          </CardContent></Card>}
        <Card><CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center gap-2"><Input className="max-w-xs" value={q} onChange={e => setQ(e.target.value)} placeholder="Search documents" aria-label="Search documents" />
            <Button size="sm" variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Showing archived" : "Show archived"}</Button></div>
          <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Category</TableHead><TableHead>Added</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{pager.pageItems.map(f => <TableRow key={f.id}>
              <TableCell><div className="font-medium">{f.title}</div><div className="text-xs text-muted-foreground">{f.file_name}{f.archive_reason ? ` · Archived: ${f.archive_reason}` : ""}</div></TableCell>
              <TableCell><Badge variant="outline">{staffVaultCategoryLabel(f.category)}</Badge></TableCell>
              <TableCell className="whitespace-nowrap">{format(new Date(f.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
              <TableCell className="space-x-1 whitespace-nowrap text-right">
                {!f.archived_at && <><Button size="sm" variant="ghost" onClick={() => open(f, "preview")}><Eye className="mr-1 h-4 w-4" />View</Button>
                  <Button size="sm" variant="ghost" onClick={() => open(f, "download")}><Download className="mr-1 h-4 w-4" />Download</Button></>}
                {isOwn && (f.archived_at ? <Button size="sm" variant="outline" onClick={() => archive(f, true)}><RotateCcw className="mr-1 h-4 w-4" />Restore</Button>
                  : <Button size="sm" variant="ghost" onClick={() => archive(f, false)}><Archive className="mr-1 h-4 w-4" />Archive</Button>)}
              </TableCell></TableRow>)}
              {!files.isLoading && !shown.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No documents.</TableCell></TableRow>}
            </TableBody></Table></div>
          <ListPagination {...pager} label="documents" />
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="log"><Card><CardContent className="pt-6">
        <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Document</TableHead><TableHead>By</TableHead></TableRow></TableHeader>
          <TableBody>{logPager.pageItems.map((r: any) => <TableRow key={r.id}><TableCell>{format(new Date(r.created_at), "dd/MM/yyyy")}</TableCell><TableCell>{format(new Date(r.created_at), "HH:mm:ss")}</TableCell>
            <TableCell><Badge variant="outline">{vaultActionLabel(r.action)}</Badge></TableCell><TableCell>{r.file_title}</TableCell><TableCell>{r.actor_name ?? "Unknown user"}{r.actor_staff_id ? ` (${r.actor_staff_id})` : ""}</TableCell></TableRow>)}
            {!log.isLoading && !(log.data ?? []).length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No activity yet.</TableCell></TableRow>}</TableBody></Table></div>
        <ListPagination {...logPager} label="log entries" />
      </CardContent></Card></TabsContent>
    </Tabs>}
  </div>;
}
