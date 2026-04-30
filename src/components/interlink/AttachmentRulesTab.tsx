import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCog, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { REPORT_KIND_LABELS, type InterlinkReportKind } from "@/lib/interlink-types";

const ALL_KINDS = Object.keys(REPORT_KIND_LABELS) as InterlinkReportKind[];
const COMMON_TYPES = ["pdf", "docx", "doc", "xlsx", "xls", "csv", "png", "jpg", "jpeg"];

interface RuleForm {
  name: string;
  description: string;
  include_categories: string[];
  exclude_categories: string[];
  allowed_file_types: string[];
  max_files: number;
  max_total_mb: number;
  cover_page_enabled: boolean;
  cover_page_title: string;
  cover_page_body: string;
  filename_template: string;
  is_active: boolean;
}

const EMPTY: RuleForm = {
  name: "",
  description: "",
  include_categories: ["daily"],
  exclude_categories: [],
  allowed_file_types: ["pdf", "docx", "xlsx", "csv"],
  max_files: 10,
  max_total_mb: 25,
  cover_page_enabled: false,
  cover_page_title: "",
  cover_page_body: "",
  filename_template: "GIS_{kind}_{date}_{seq}_{orig}",
  is_active: true,
};

export function AttachmentRulesTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["interlink-rules-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_attachment_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  function openCreate() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(r: any) {
    setEditing(r);
    setForm({
      name: r.name, description: r.description ?? "",
      include_categories: r.include_categories ?? [],
      exclude_categories: r.exclude_categories ?? [],
      allowed_file_types: r.allowed_file_types ?? [],
      max_files: r.max_files, max_total_mb: r.max_total_mb,
      cover_page_enabled: r.cover_page_enabled,
      cover_page_title: r.cover_page_title ?? "",
      cover_page_body: r.cover_page_body ?? "",
      filename_template: r.filename_template, is_active: r.is_active,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), created_by: userId };
      const { error } = editing
        ? await supabase.from("interlink_attachment_rules").update(payload).eq("id", editing.id)
        : await supabase.from("interlink_attachment_rules").insert(payload);
      if (error) throw error;
      toast.success(editing ? "Rule updated" : "Rule created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["interlink-rules-full"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  async function remove(r: any) {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    const { error } = await supabase.from("interlink_attachment_rules").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["interlink-rules-full"] }); }
  }

  function toggleArr(arr: string[], v: string) {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><FileCog className="h-4 w-4 text-amber-600" /> Attachment rules</h3>
          <p className="text-xs text-muted-foreground">Reusable presets controlling which reports attach, the file naming and an optional cover page.</p>
        </div>
        <Button onClick={openCreate} className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <Plus className="h-4 w-4 mr-1.5" /> New rule
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Includes</TableHead>
                <TableHead>File types</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead>Cover</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6"><Loader2 className="inline h-4 w-4 animate-spin" /></TableCell></TableRow>
              ) : rules.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground italic">No rules yet.</TableCell></TableRow>
              ) : rules.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">{r.description ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs">{(r.include_categories ?? []).join(", ") || "—"}</TableCell>
                  <TableCell className="text-xs">{(r.allowed_file_types ?? []).join(", ") || "any"}</TableCell>
                  <TableCell className="text-xs">{r.max_files} files · {r.max_total_mb} MB</TableCell>
                  <TableCell><Badge variant={r.cover_page_enabled ? "default" : "outline"} className="text-[10px]">{r.cover_page_enabled ? "On" : "Off"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit rule" : "New attachment rule"}</DialogTitle>
            <DialogDescription>Filename tokens: {"{kind} {date} {scope} {seq} {orig}"}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="md:col-span-2">
              <Label>Include report categories</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {ALL_KINDS.map((k) => (
                  <Badge key={k} variant={form.include_categories.includes(k) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setForm({ ...form, include_categories: toggleArr(form.include_categories, k) })}>
                    {REPORT_KIND_LABELS[k]}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <Label>Exclude categories</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {ALL_KINDS.map((k) => (
                  <Badge key={k} variant={form.exclude_categories.includes(k) ? "destructive" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setForm({ ...form, exclude_categories: toggleArr(form.exclude_categories, k) })}>
                    {REPORT_KIND_LABELS[k]}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <Label>Allowed file types (empty = any)</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {COMMON_TYPES.map((t) => (
                  <Badge key={t} variant={form.allowed_file_types.includes(t) ? "default" : "outline"}
                    className="cursor-pointer uppercase"
                    onClick={() => setForm({ ...form, allowed_file_types: toggleArr(form.allowed_file_types, t) })}>
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label>Max files</Label>
              <Input type="number" min={1} max={50} value={form.max_files}
                onChange={(e) => setForm({ ...form, max_files: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Max total (MB)</Label>
              <Input type="number" min={1} max={100} value={form.max_total_mb}
                onChange={(e) => setForm({ ...form, max_total_mb: Number(e.target.value) })} />
            </div>

            <div className="md:col-span-2">
              <Label>Filename template</Label>
              <Input value={form.filename_template} onChange={(e) => setForm({ ...form, filename_template: e.target.value })} />
            </div>

            <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Cover page</Label>
                <p className="text-xs text-muted-foreground">Prepend a generated PDF cover sheet to dispatches.</p>
              </div>
              <Switch checked={form.cover_page_enabled}
                onCheckedChange={(v) => setForm({ ...form, cover_page_enabled: v })} />
            </div>
            {form.cover_page_enabled && (
              <>
                <div className="md:col-span-2">
                  <Label>Cover title</Label>
                  <Input value={form.cover_page_title} onChange={(e) => setForm({ ...form, cover_page_title: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label>Cover body</Label>
                  <Textarea value={form.cover_page_body} onChange={(e) => setForm({ ...form, cover_page_body: e.target.value })} rows={3} />
                </div>
              </>
            )}

            <div className="md:col-span-2 flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <span className="text-sm">Active</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
