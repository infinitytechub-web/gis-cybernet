import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ExportMenu } from "@/components/ui/export-menu";
import { Package, Plus, Pencil, Trash2, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Sliders, Boxes, TrendingDown, Activity, Truck, Tag, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

const PIE_COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
const MOVEMENT_TYPES = [
  { value: "in", label: "Stock In", icon: ArrowDownToLine, color: "text-emerald-600" },
  { value: "out", label: "Stock Out", icon: ArrowUpFromLine, color: "text-rose-600" },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight, color: "text-blue-600" },
  { value: "adjustment", label: "Adjustment", icon: Sliders, color: "text-amber-600" },
];

export default function Stores() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("items");
  const canManage = ["admin", "oic", "2ic", "storekeeper"].includes(role || "");

  // Realtime invalidation
  useEffect(() => {
    const ch = supabase.channel("stores-realtime");
    ["inventory_items", "inventory_movements", "inventory_issuance", "inventory_categories", "inventory_suppliers"].forEach(t =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        qc.invalidateQueries({ queryKey: [t] });
        qc.invalidateQueries({ queryKey: ["stores-analytics"] });
      })
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-secondary">Stores & Inventory</h1>
            <p className="text-sm text-muted-foreground">Stock control, issuance, suppliers and analytics</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50 p-1">
          <TabsTrigger value="items" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white"><Boxes className="h-4 w-4 mr-1 text-amber-700 dark:text-amber-400" />Items</TabsTrigger>
          <TabsTrigger value="movements" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><Activity className="h-4 w-4 mr-1 text-blue-700 dark:text-blue-400" />Movements</TabsTrigger>
          <TabsTrigger value="issuance" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"><ArrowUpFromLine className="h-4 w-4 mr-1 text-emerald-700 dark:text-emerald-400" />Issuance</TabsTrigger>
          <TabsTrigger value="suppliers" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white"><Truck className="h-4 w-4 mr-1 text-indigo-700 dark:text-indigo-400" />Suppliers</TabsTrigger>
          <TabsTrigger value="categories" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white"><Tag className="h-4 w-4 mr-1 text-violet-700 dark:text-violet-400" />Categories</TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white"><BarChart3 className="h-4 w-4 mr-1 text-teal-700 dark:text-teal-400" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="items"><ItemsTab canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="movements"><MovementsTab canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="issuance"><IssuanceTab canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="suppliers"><SuppliersTab canManage={canManage} /></TabsContent>
        <TabsContent value="categories"><CategoriesTab canManage={canManage} /></TabsContent>
        <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ----------------- ITEMS ----------------- */
function ItemsTab({ canManage, userId }: { canManage: boolean; userId?: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStock, setFilterStock] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", sku: "", category_id: "", unit: "pcs", min_stock: 0, unit_cost: 0, location: "", condition: "good", notes: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["inventory_items"],
    queryFn: async () => (await supabase.from("inventory_items").select("*, inventory_categories(name)").order("name")).data || [],
  });
  const { data: cats = [] } = useQuery({
    queryKey: ["inventory_categories"],
    queryFn: async () => (await supabase.from("inventory_categories").select("*").order("name")).data || [],
  });

  const filtered = useMemo(() => items.filter((i: any) => {
    if (search && !`${i.name} ${i.sku || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat !== "all" && i.category_id !== filterCat) return false;
    if (filterStock === "low" && Number(i.qty_on_hand) > Number(i.min_stock)) return false;
    if (filterStock === "out" && Number(i.qty_on_hand) > 0) return false;
    return true;
  }), [items, search, filterCat, filterStock]);

  const open = (item?: any) => {
    if (item) {
      setEditing(item);
      setForm({ name: item.name, sku: item.sku || "", category_id: item.category_id || "", unit: item.unit, min_stock: Number(item.min_stock), unit_cost: Number(item.unit_cost || 0), location: item.location || "", condition: item.condition || "good", notes: item.notes || "" });
    } else {
      setEditing(null);
      setForm({ name: "", sku: "", category_id: "", unit: "pcs", min_stock: 0, unit_cost: 0, location: "", condition: "good", notes: "" });
    }
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name required");
      const payload = { ...form, category_id: form.category_id || null, sku: form.sku || null };
      if (editing) {
        const { error } = await supabase.from("inventory_items").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory_items"] }); setDialogOpen(false); toast.success(editing ? "Item updated" : "Item created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("inventory_items").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory_items"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search name or SKU…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterStock} onValueChange={setFilterStock}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All stock</SelectItem><SelectItem value="low">Low stock</SelectItem><SelectItem value="out">Out of stock</SelectItem></SelectContent>
        </Select>
        <ExportMenu getData={() => ({
          title: "Inventory Items",
          filename: `inventory-items-${format(new Date(), "yyyy-MM-dd")}`,
          headers: ["Name", "SKU", "Category", "Unit", "Qty on hand", "Min stock", "Location", "Condition"],
          rows: filtered.map((i: any) => [i.name, i.sku || "-", i.inventory_categories?.name || "-", i.unit, String(i.qty_on_hand), String(i.min_stock), i.location || "-", i.condition || "-"]),
        })} />
        {canManage && <Button onClick={() => open()} className="ml-auto gap-1"><Plus className="h-4 w-4" />Add Item</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader><TableRow>
                <TableHead>Item</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead>
                <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Min</TableHead>
                <TableHead>Location</TableHead><TableHead>Status</TableHead>{canManage && <TableHead></TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center py-6 text-muted-foreground">No items</TableCell></TableRow>
                ) : filtered.map((i: any) => {
                  const low = Number(i.qty_on_hand) <= Number(i.min_stock);
                  const out = Number(i.qty_on_hand) <= 0;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="font-mono text-xs">{i.sku || "—"}</TableCell>
                      <TableCell>{i.inventory_categories?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right font-bold">{Number(i.qty_on_hand)} <span className="text-xs text-muted-foreground font-normal">{i.unit}</span></TableCell>
                      <TableCell className="text-right text-muted-foreground">{Number(i.min_stock)}</TableCell>
                      <TableCell className="text-xs">{i.location || "—"}</TableCell>
                      <TableCell>
                        {out ? <Badge variant="destructive">Out</Badge> :
                         low ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100"><AlertTriangle className="h-3 w-3 mr-1" />Low</Badge> :
                         <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">OK</Badge>}
                      </TableCell>
                      {canManage && <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => open(i)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Delete "{i.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>All movement history for this item will be removed.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(i.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Item" : "Add Item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>SKU</Label><Input value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm(p => ({ ...p, category_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Unit</Label>
                <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["pcs", "box", "pack", "L", "kg", "set", "roll"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Min Stock</Label><Input type="number" value={form.min_stock} onChange={e => setForm(p => ({ ...p, min_stock: Number(e.target.value) }))} /></div>
              <div><Label>Unit Cost (₵)</Label><Input type="number" step="0.01" value={form.unit_cost} onChange={e => setForm(p => ({ ...p, unit_cost: Number(e.target.value) }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Location</Label><Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Store room A" /></div>
              <div><Label>Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm(p => ({ ...p, condition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["good", "fair", "poor", "damaged"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">{save.isPending ? "Saving…" : editing ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------- MOVEMENTS ----------------- */
function MovementsTab({ canManage, userId }: { canManage: boolean; userId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_id: "", movement_type: "in", quantity: 1, supplier_id: "", reference: "", from_location: "", to_location: "", notes: "" });

  const { data: movements = [] } = useQuery({
    queryKey: ["inventory_movements"],
    queryFn: async () => (await supabase.from("inventory_movements").select("*, inventory_items(name, unit), inventory_suppliers(name)").order("movement_date", { ascending: false }).limit(200)).data || [],
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inventory_items"],
    queryFn: async () => (await supabase.from("inventory_items").select("id, name, unit").order("name")).data || [],
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["inventory_suppliers"],
    queryFn: async () => (await supabase.from("inventory_suppliers").select("id, name").order("name")).data || [],
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.item_id) throw new Error("Item required");
      if (Number(form.quantity) <= 0) throw new Error("Quantity must be > 0");
      const payload: any = { ...form, performed_by: userId, supplier_id: form.supplier_id || null };
      const { error } = await supabase.from("inventory_movements").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory_movements"] }); qc.invalidateQueries({ queryKey: ["inventory_items"] }); setOpen(false); toast.success("Movement recorded"); setForm({ item_id: "", movement_type: "in", quantity: 1, supplier_id: "", reference: "", from_location: "", to_location: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ExportMenu getData={() => ({
          title: "Stock Movements",
          filename: `stock-movements-${format(new Date(), "yyyy-MM-dd")}`,
          headers: ["Date", "Item", "Type", "Qty", "Supplier", "Ref", "Notes"],
          rows: movements.map((m: any) => [format(new Date(m.movement_date), "yyyy-MM-dd HH:mm"), m.inventory_items?.name || "—", m.movement_type, String(m.quantity), m.inventory_suppliers?.name || "—", m.reference || "—", m.notes || "—"]),
        })} />
        {canManage && <Button onClick={() => setOpen(true)} className="ml-auto gap-1"><Plus className="h-4 w-4" />Record Movement</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Supplier</TableHead><TableHead>Reference</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {movements.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No movements</TableCell></TableRow>
                : movements.map((m: any) => {
                  const meta = MOVEMENT_TYPES.find(t => t.value === m.movement_type);
                  const Icon = meta?.icon || Activity;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(m.movement_date), "MMM d, HH:mm")}</TableCell>
                      <TableCell className="font-medium">{m.inventory_items?.name}</TableCell>
                      <TableCell><Badge variant="outline" className="gap-1"><Icon className={`h-3 w-3 ${meta?.color}`} />{meta?.label}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{Number(m.quantity)} {m.inventory_items?.unit}</TableCell>
                      <TableCell>{m.inventory_suppliers?.name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{m.reference || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{m.notes || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Stock Movement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Item *</Label>
              <Select value={form.item_id} onValueChange={v => setForm(p => ({ ...p, item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select item…" /></SelectTrigger>
                <SelectContent>{items.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type *</Label>
                <Select value={form.movement_type} onValueChange={v => setForm(p => ({ ...p, movement_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MOVEMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Quantity *</Label><Input type="number" min={0.01} step="0.01" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))} /></div>
            </div>
            {form.movement_type === "in" && (
              <div><Label>Supplier</Label>
                <Select value={form.supplier_id} onValueChange={v => setForm(p => ({ ...p, supplier_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.movement_type === "transfer" && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>From</Label><Input value={form.from_location} onChange={e => setForm(p => ({ ...p, from_location: e.target.value }))} /></div>
                <div><Label>To</Label><Input value={form.to_location} onChange={e => setForm(p => ({ ...p, to_location: e.target.value }))} /></div>
              </div>
            )}
            <div><Label>Reference / PO #</Label><Input value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} /></div>
            <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">{create.isPending ? "Saving…" : "Record"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------- ISSUANCE ----------------- */
function IssuanceTab({ canManage, userId }: { canManage: boolean; userId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_id: "", profile_id: "", quantity: 1, notes: "" });

  const { data: issuance = [] } = useQuery({
    queryKey: ["inventory_issuance"],
    queryFn: async () => (await supabase.from("inventory_issuance").select("*, inventory_items(name, unit), profiles!inventory_issuance_profile_id_fkey(first_name, last_name, staff_id)").order("issued_at", { ascending: false }).limit(200)).data || [],
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inventory_items"],
    queryFn: async () => (await supabase.from("inventory_items").select("id, name, unit, qty_on_hand").order("name")).data || [],
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["staff-for-issuance"],
    queryFn: async () => (await supabase.from("profiles").select("id, first_name, last_name, staff_id").eq("status", "active").order("first_name")).data || [],
  });

  const issue = useMutation({
    mutationFn: async () => {
      if (!form.item_id || !form.profile_id) throw new Error("Item and recipient required");
      const { error: e1 } = await supabase.from("inventory_issuance").insert({ ...form, issued_by: userId });
      if (e1) throw e1;
      // also create movement
      const { error: e2 } = await supabase.from("inventory_movements").insert({ item_id: form.item_id, movement_type: "out", quantity: form.quantity, issued_to_profile_id: form.profile_id, performed_by: userId, notes: `Issued: ${form.notes}` });
      if (e2) throw e2;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory_issuance"] }); qc.invalidateQueries({ queryKey: ["inventory_items"] }); setOpen(false); toast.success("Item issued"); setForm({ item_id: "", profile_id: "", quantity: 1, notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const markReturned = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("inventory_issuance").update({ returned_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory_issuance"] }); toast.success("Marked returned"); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ExportMenu getData={() => ({
          title: "Equipment Issuance",
          filename: `issuance-${format(new Date(), "yyyy-MM-dd")}`,
          headers: ["Issued", "Item", "Recipient", "Staff ID", "Qty", "Status"],
          rows: issuance.map((i: any) => [format(new Date(i.issued_at), "yyyy-MM-dd"), i.inventory_items?.name || "—", `${i.profiles?.first_name || ""} ${i.profiles?.last_name || ""}`.trim(), i.profiles?.staff_id || "—", String(i.quantity), i.returned_at ? "Returned" : "Active"]),
        })} />
        {canManage && <Button onClick={() => setOpen(true)} className="ml-auto gap-1"><Plus className="h-4 w-4" />Issue Item</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Recipient</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Status</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
              <TableBody>
                {issuance.length === 0 ? <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-6 text-muted-foreground">No issuance records</TableCell></TableRow>
                : issuance.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(i.issued_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{i.inventory_items?.name}</TableCell>
                    <TableCell><div className="text-sm">{i.profiles?.first_name} {i.profiles?.last_name}</div><div className="text-xs text-muted-foreground font-mono">{i.profiles?.staff_id}</div></TableCell>
                    <TableCell className="text-right font-semibold">{Number(i.quantity)} {i.inventory_items?.unit}</TableCell>
                    <TableCell>{i.returned_at ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">Returned {format(new Date(i.returned_at), "MMM d")}</Badge> : <Badge variant="outline">Active</Badge>}</TableCell>
                    {canManage && <TableCell>{!i.returned_at && <Button size="sm" variant="outline" onClick={() => markReturned.mutate(i.id)}>Mark Returned</Button>}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue Item to Staff</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Item *</Label>
              <Select value={form.item_id} onValueChange={v => setForm(p => ({ ...p, item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select item…" /></SelectTrigger>
                <SelectContent>{items.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name} ({Number(i.qty_on_hand)} {i.unit} available)</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Recipient (Staff) *</Label>
              <Select value={form.profile_id} onValueChange={v => setForm(p => ({ ...p, profile_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff…" /></SelectTrigger>
                <SelectContent>{staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.staff_id})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantity *</Label><Input type="number" min={1} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))} /></div>
            <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <Button onClick={() => issue.mutate()} disabled={issue.isPending} className="w-full">{issue.isPending ? "Issuing…" : "Issue"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------- SUPPLIERS ----------------- */
function SuppliersTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", contact_person: "", phone: "", email: "", address: "", notes: "" });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["inventory_suppliers"],
    queryFn: async () => (await supabase.from("inventory_suppliers").select("*").order("name")).data || [],
  });

  const openD = (s?: any) => { if (s) { setEditing(s); setForm({ name: s.name, contact_person: s.contact_person || "", phone: s.phone || "", email: s.email || "", address: s.address || "", notes: s.notes || "" }); } else { setEditing(null); setForm({ name: "", contact_person: "", phone: "", email: "", address: "", notes: "" }); } setOpen(true); };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name required");
      if (editing) { const { error } = await supabase.from("inventory_suppliers").update(form).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("inventory_suppliers").insert(form); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory_suppliers"] }); setOpen(false); toast.success(editing ? "Updated" : "Created"); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("inventory_suppliers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory_suppliers"] }); toast.success("Deleted"); },
  });

  return (
    <div className="space-y-3">
      {canManage && <div className="flex justify-end"><Button onClick={() => openD()} className="gap-1"><Plus className="h-4 w-4" />Add Supplier</Button></div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {suppliers.length === 0 && <p className="col-span-full text-center text-muted-foreground py-6">No suppliers</p>}
        {suppliers.map((s: any) => (
          <Card key={s.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4 text-primary" />{s.name}</CardTitle>
              {canManage && <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openD(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                  <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete?</AlertDialogTitle></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(s.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
              </div>}
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {s.contact_person && <p className="text-muted-foreground">{s.contact_person}</p>}
              {s.phone && <p>📞 {s.phone}</p>}
              {s.email && <p className="text-xs">✉ {s.email}</p>}
              {s.address && <p className="text-xs text-muted-foreground">{s.address}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            </div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>Address</Label><Textarea rows={2} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">{save.isPending ? "Saving…" : editing ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------- CATEGORIES ----------------- */
function CategoriesTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data: cats = [] } = useQuery({
    queryKey: ["inventory_categories"],
    queryFn: async () => (await supabase.from("inventory_categories").select("*").order("name")).data || [],
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name required");
      if (editing) { const { error } = await supabase.from("inventory_categories").update(form).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("inventory_categories").insert(form); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory_categories"] }); setOpen(false); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("inventory_categories").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory_categories"] }); toast.success("Deleted"); },
  });

  return (
    <div className="space-y-3">
      {canManage && <div className="flex justify-end"><Button onClick={() => { setEditing(null); setForm({ name: "", description: "" }); setOpen(true); }} className="gap-1"><Plus className="h-4 w-4" />Add Category</Button></div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cats.length === 0 && <p className="col-span-full text-center text-muted-foreground py-6">No categories</p>}
        {cats.map((c: any) => (
          <Card key={c.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4 text-primary" />{c.name}</CardTitle>
              {canManage && <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(c); setForm({ name: c.name, description: c.description || "" }); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                  <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete?</AlertDialogTitle></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(c.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
              </div>}
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{c.description || "No description"}</p></CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">{save.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------- ANALYTICS ----------------- */
function AnalyticsTab() {
  const { data } = useQuery({
    queryKey: ["stores-analytics"],
    queryFn: async () => {
      const [itemsRes, movRes, issRes, catsRes] = await Promise.all([
        supabase.from("inventory_items").select("*, inventory_categories(name)"),
        supabase.from("inventory_movements").select("movement_type, quantity, movement_date, item_id, inventory_items(name)").gte("movement_date", new Date(Date.now() - 30 * 86400000).toISOString()),
        supabase.from("inventory_issuance").select("item_id, quantity, inventory_items(name)"),
        supabase.from("inventory_categories").select("id, name"),
      ]);
      return { items: itemsRes.data || [], movements: movRes.data || [], issuance: issRes.data || [], cats: catsRes.data || [] };
    },
    refetchInterval: 60_000,
  });

  if (!data) return <div className="text-center py-8 text-muted-foreground">Loading analytics…</div>;

  const totalItems = data.items.length;
  const totalValue = data.items.reduce((s, i: any) => s + Number(i.qty_on_hand) * Number(i.unit_cost || 0), 0);
  const lowStock = data.items.filter((i: any) => Number(i.qty_on_hand) <= Number(i.min_stock));
  const outOfStock = data.items.filter((i: any) => Number(i.qty_on_hand) <= 0);

  // Stock value by category
  const valueByCat: Record<string, number> = {};
  data.items.forEach((i: any) => {
    const cat = i.inventory_categories?.name || "Uncategorized";
    valueByCat[cat] = (valueByCat[cat] || 0) + Number(i.qty_on_hand) * Number(i.unit_cost || 0);
  });
  const valueByCatData = Object.entries(valueByCat).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);

  // Movements 30 days
  const movByDay: Record<string, { date: string; in: number; out: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = format(new Date(Date.now() - i * 86400000), "MMM d");
    movByDay[d] = { date: d, in: 0, out: 0 };
  }
  data.movements.forEach((m: any) => {
    const d = format(new Date(m.movement_date), "MMM d");
    if (movByDay[d]) {
      if (m.movement_type === "in") movByDay[d].in += Number(m.quantity);
      else if (m.movement_type === "out") movByDay[d].out += Number(m.quantity);
    }
  });

  // Top issued
  const issByItem: Record<string, { name: string; qty: number }> = {};
  data.issuance.forEach((i: any) => {
    const n = i.inventory_items?.name || "?";
    if (!issByItem[n]) issByItem[n] = { name: n, qty: 0 };
    issByItem[n].qty += Number(i.quantity);
  });
  const topIssued = Object.values(issByItem).sort((a, b) => b.qty - a.qty).slice(0, 8);

  // By location
  const byLoc: Record<string, number> = {};
  data.items.forEach((i: any) => { const l = i.location || "Unspecified"; byLoc[l] = (byLoc[l] || 0) + 1; });
  const byLocData = Object.entries(byLoc).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI title="Total Items" value={totalItems} icon={Boxes} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/40" />
        <KPI title="Stock Value" value={`₵${totalValue.toLocaleString()}`} icon={Activity} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/40" />
        <KPI title="Low Stock" value={lowStock.length} icon={AlertTriangle} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/40" />
        <KPI title="Out of Stock" value={outOfStock.length} icon={TrendingDown} color="text-rose-600" bg="bg-rose-50 dark:bg-rose-950/40" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Stock Value by Category (₵)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={valueByCatData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="value" fill="hsl(var(--primary))" /></BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Items by Location</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart><Pie data={byLocData} dataKey="value" nameKey="name" outerRadius={90} label>{byLocData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Stock Movements (Last 30 Days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={Object.values(movByDay)}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="in" stroke="#10b981" name="Stock In" /><Line type="monotone" dataKey="out" stroke="#ef4444" name="Stock Out" /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Top Issued Items</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topIssued} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" width={120} fontSize={11} /><Tooltip /><Bar dataKey="qty" fill="#8b5cf6" /></BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Low Stock Alerts</CardTitle></CardHeader>
          <CardContent>
            {lowStock.length === 0 ? <p className="text-sm text-muted-foreground">All items are above min stock ✓</p> :
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {lowStock.map((i: any) => (
                  <div key={i.id} className="flex items-center justify-between p-2 rounded border bg-amber-50/50 dark:bg-amber-950/20">
                    <div><div className="font-medium text-sm">{i.name}</div><div className="text-xs text-muted-foreground">{i.inventory_categories?.name || "Uncategorized"}</div></div>
                    <Badge variant="outline" className="border-amber-400">{Number(i.qty_on_hand)} / min {Number(i.min_stock)}</Badge>
                  </div>
                ))}
              </div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPI({ title, value, icon: Icon, color, bg }: any) {
  return (
    <Card className={`${bg} border-2`}>
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent className="px-3 pb-3"><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}
