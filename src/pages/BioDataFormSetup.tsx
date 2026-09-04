/**
 * BIO-DATA FORM SETUP — administrators only.
 *
 * Lets an administrator shape the Personnel Bio-Data & Service Record form
 * without a code change: manage the searchable dropdown lists, add or retire
 * extra fields in any lettered section, and add extra repeating tables with
 * their own columns. Row level security on the biodata_* tables restricts every
 * write here to administrators, so this screen is a convenience layer, not the
 * security boundary.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, ListPlus, Table2, SlidersHorizontal } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  BIODATA_SECTIONS, useBioDataCustomFields, useBioDataCustomTables, useBioDataOptionSets,
} from "@/components/staff/biodata/useBioDataConfig";

const FIELD_TYPES = ["text", "number", "date", "select", "boolean", "textarea"] as const;
const COLUMN_TYPES = ["text", "number", "date", "select", "boolean"] as const;

export default function BioDataFormSetup() {
  usePageMeta({
    title: "Bio-Data Form Setup | Personnel records",
    description: "Manage the dropdown lists, extra fields and extra tables of the personnel bio-data form.",
  });
  const qc = useQueryClient();
  const { data: optionSets = [], isLoading: loadingSets } = useBioDataOptionSets();
  const { data: fields = [] } = useBioDataCustomFields();
  const { data: tables = [] } = useBioDataCustomTables();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["biodata-option-sets"] });
    qc.invalidateQueries({ queryKey: ["biodata-custom-fields"] });
    qc.invalidateQueries({ queryKey: ["biodata-custom-tables"] });
  };

  // ── Dropdown lists ────────────────────────────────────────────────────────
  const [newOption, setNewOption] = useState<Record<string, string>>({});
  const addOption = useMutation({
    mutationFn: async ({ setId, label }: { setId: string; label: string }) => {
      const value = label.trim();
      if (!value) throw new Error("Enter the option name first");
      const existing = optionSets.find((s) => s.id === setId)?.options ?? [];
      const { error } = await supabase.from("biodata_options").insert({
        set_id: setId, value, label: value, sort_order: existing.length + 1, active: true,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { setNewOption((p) => ({ ...p, [v.setId]: "" })); refresh(); toast.success("Option added"); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleOption = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("biodata_options").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e.message),
  });
  const removeOption = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("biodata_options").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Option removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  const [newSetLabel, setNewSetLabel] = useState("");
  const addSet = useMutation({
    mutationFn: async () => {
      const label = newSetLabel.trim();
      if (!label) throw new Error("Enter a list name");
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const { error } = await supabase.from("biodata_option_sets").insert({ key, label });
      if (error) throw error;
    },
    onSuccess: () => { setNewSetLabel(""); refresh(); toast.success("List created"); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Extra fields ──────────────────────────────────────────────────────────
  const [fieldSection, setFieldSection] = useState("A");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<string>("text");
  const [fieldSetId, setFieldSetId] = useState<string>("");
  const [fieldRequired, setFieldRequired] = useState(false);
  const addField = useMutation({
    mutationFn: async () => {
      if (!fieldLabel.trim()) throw new Error("Enter the field label");
      if (fieldType === "select" && !fieldSetId) throw new Error("Choose the dropdown list for this field");
      const { error } = await supabase.from("biodata_custom_fields").insert({
        section: fieldSection,
        label: fieldLabel.trim(),
        field_type: fieldType,
        option_set_id: fieldType === "select" ? fieldSetId : null,
        required: fieldRequired,
        sort_order: fields.filter((f) => f.section === fieldSection).length + 1,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { setFieldLabel(""); setFieldRequired(false); refresh(); toast.success("Field added"); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleField = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("biodata_custom_fields").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e.message),
  });
  const removeField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("biodata_custom_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Field removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Extra tables ──────────────────────────────────────────────────────────
  const [tableSection, setTableSection] = useState("F");
  const [tableLabel, setTableLabel] = useState("");
  const addTable = useMutation({
    mutationFn: async () => {
      if (!tableLabel.trim()) throw new Error("Enter the table name");
      const { error } = await supabase.from("biodata_custom_tables").insert({
        section: tableSection,
        label: tableLabel.trim(),
        sort_order: tables.filter((t) => t.section === tableSection).length + 1,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { setTableLabel(""); refresh(); toast.success("Table added"); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("biodata_custom_tables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Table removed"); },
    onError: (e: any) => toast.error(e.message),
  });
  const [newColumn, setNewColumn] = useState<Record<string, { label: string; type: string; setId: string }>>({});
  const addColumn = useMutation({
    mutationFn: async (tableId: string) => {
      const draft = newColumn[tableId];
      if (!draft?.label?.trim()) throw new Error("Enter the column name");
      if (draft.type === "select" && !draft.setId) throw new Error("Choose the dropdown list for this column");
      const count = tables.find((t) => t.id === tableId)?.columns.length ?? 0;
      const { error } = await supabase.from("biodata_custom_columns").insert({
        table_id: tableId,
        label: draft.label.trim(),
        column_type: draft.type,
        option_set_id: draft.type === "select" ? draft.setId : null,
        required: false,
        sort_order: count + 1,
      });
      if (error) throw error;
    },
    onSuccess: (_d, tableId) => {
      setNewColumn((p) => ({ ...p, [tableId]: { label: "", type: "text", setId: "" } }));
      refresh();
      toast.success("Column added");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removeColumn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("biodata_custom_columns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Column removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bio-Data Form Setup</h1>
        <p className="text-sm text-muted-foreground">
          Change the dropdown lists, extra fields and extra tables used by the Personnel Bio-Data &amp;
          Service Record form. Administrators only.
        </p>
      </div>

      <Tabs defaultValue="lists">
        <TabsList>
          <TabsTrigger value="lists"><ListPlus className="mr-1 h-4 w-4" aria-hidden="true" /> Dropdown lists</TabsTrigger>
          <TabsTrigger value="fields"><SlidersHorizontal className="mr-1 h-4 w-4" aria-hidden="true" /> Extra fields</TabsTrigger>
          <TabsTrigger value="tables"><Table2 className="mr-1 h-4 w-4" aria-hidden="true" /> Extra tables</TabsTrigger>
        </TabsList>

        {/* Dropdown lists */}
        <TabsContent value="lists" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New list</CardTitle>
              <CardDescription>Create a searchable list you can attach to a field or column.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <Label htmlFor="new-set">List name</Label>
                <Input id="new-set" value={newSetLabel} onChange={(e) => setNewSetLabel(e.target.value)} placeholder="e.g. Languages spoken" />
              </div>
              <Button onClick={() => addSet.mutate()} disabled={addSet.isPending} className="gap-1">
                {addSet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                Create list
              </Button>
            </CardContent>
          </Card>

          {loadingSets && <p className="text-sm text-muted-foreground">Loading lists…</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            {optionSets.map((set) => (
              <Card key={set.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{set.label}</CardTitle>
                  <CardDescription>{set.options.length} option(s)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1">
                    {set.options.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm">
                        <span className={o.active ? "" : "text-muted-foreground line-through"}>{o.label}</span>
                        <span className="flex items-center gap-2">
                          <Switch
                            checked={o.active}
                            aria-label={`${o.label} shown on the form`}
                            onCheckedChange={(v) => toggleOption.mutate({ id: o.id, active: v })}
                          />
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            aria-label={`Remove ${o.label}`}
                            onClick={() => removeOption.mutate(o.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-end gap-2">
                    <Input
                      aria-label={`New option for ${set.label}`}
                      value={newOption[set.id] ?? ""}
                      placeholder="Add an option"
                      onChange={(e) => setNewOption((p) => ({ ...p, [set.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      onClick={() => addOption.mutate({ setId: set.id, label: newOption[set.id] ?? "" })}
                      disabled={addOption.isPending}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Extra fields */}
        <TabsContent value="fields" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a field</CardTitle>
              <CardDescription>The field appears at the end of the section you choose.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="field-section">Section</Label>
                <Select value={fieldSection} onValueChange={setFieldSection}>
                  <SelectTrigger id="field-section"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BIODATA_SECTIONS.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.key}. {s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="field-label">Label</Label>
                <Input id="field-label" value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="field-type">Type</Label>
                <Select value={fieldType} onValueChange={setFieldType}>
                  <SelectTrigger id="field-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fieldType === "select" && (
                <div>
                  <Label htmlFor="field-set">Dropdown list</Label>
                  <Select value={fieldSetId} onValueChange={setFieldSetId}>
                    <SelectTrigger id="field-set"><SelectValue placeholder="Choose list" /></SelectTrigger>
                    <SelectContent>
                      {optionSets.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2 pt-6">
                <Switch id="field-required" checked={fieldRequired} onCheckedChange={setFieldRequired} />
                <Label htmlFor="field-required">Required</Label>
              </div>
              <div className="pt-6">
                <Button onClick={() => addField.mutate()} disabled={addField.isPending} className="gap-1">
                  {addField.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                  Add field
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {BIODATA_SECTIONS.filter((s) => fields.some((f) => f.section === s.key)).map((s) => (
              <Card key={s.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{s.key}. {s.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {fields.filter((f) => f.section === s.key).map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className={f.active ? "font-medium" : "text-muted-foreground line-through"}>{f.label}</span>
                        <Badge variant="secondary" className="capitalize">{f.field_type}</Badge>
                        {f.required && <Badge variant="outline">Required</Badge>}
                      </span>
                      <span className="flex items-center gap-2">
                        <Switch
                          checked={f.active}
                          aria-label={`${f.label} shown on the form`}
                          onCheckedChange={(v) => toggleField.mutate({ id: f.id, active: v })}
                        />
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          aria-label={`Remove ${f.label}`}
                          onClick={() => removeField.mutate(f.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Extra tables */}
        <TabsContent value="tables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a table</CardTitle>
              <CardDescription>Staff can add, edit and remove rows in the section you choose.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="table-section">Section</Label>
                <Select value={tableSection} onValueChange={setTableSection}>
                  <SelectTrigger id="table-section" className="min-w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BIODATA_SECTIONS.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.key}. {s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[220px] flex-1">
                <Label htmlFor="table-label">Table name</Label>
                <Input id="table-label" value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} placeholder="e.g. Courses attended" />
              </div>
              <Button onClick={() => addTable.mutate()} disabled={addTable.isPending} className="gap-1">
                {addTable.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                Add table
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {tables.map((t) => {
              const draft = newColumn[t.id] ?? { label: "", type: "text", setId: "" };
              return (
                <Card key={t.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{t.label}</CardTitle>
                        <CardDescription>Section {t.section} · {t.columns.length} column(s)</CardDescription>
                      </div>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        aria-label={`Remove ${t.label}`}
                        onClick={() => removeTable.mutate(t.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-1">
                      {t.columns.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm">
                          <span className="flex items-center gap-2">
                            {c.label}
                            <Badge variant="secondary" className="capitalize">{c.column_type}</Badge>
                          </span>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            aria-label={`Remove column ${c.label}`}
                            onClick={() => removeColumn.mutate(c.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        aria-label={`New column for ${t.label}`}
                        placeholder="Column name"
                        value={draft.label}
                        onChange={(e) => setNewColumn((p) => ({ ...p, [t.id]: { ...draft, label: e.target.value } }))}
                      />
                      <Select
                        value={draft.type}
                        onValueChange={(v) => setNewColumn((p) => ({ ...p, [t.id]: { ...draft, type: v } }))}
                      >
                        <SelectTrigger aria-label={`Column type for ${t.label}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COLUMN_TYPES.map((ct) => (
                            <SelectItem key={ct} value={ct} className="capitalize">{ct}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {draft.type === "select" && (
                        <Select
                          value={draft.setId}
                          onValueChange={(v) => setNewColumn((p) => ({ ...p, [t.id]: { ...draft, setId: v } }))}
                        >
                          <SelectTrigger aria-label={`Dropdown list for ${t.label}`}><SelectValue placeholder="Choose list" /></SelectTrigger>
                          <SelectContent>
                            {optionSets.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button size="sm" onClick={() => addColumn.mutate(t.id)} disabled={addColumn.isPending} className="gap-1">
                        <Plus className="h-4 w-4" aria-hidden="true" /> Add column
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
