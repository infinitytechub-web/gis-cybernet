/**
 * COMMAND CONSOLE PROCUREMENT — request, approve, receive and audit.
 *
 * The lifecycle is draft → submitted → approved | rejected → partial → received.
 * Any signed-in officer can raise a request for their own command; approving and
 * receiving are reserved for the storekeeper tier (admin, OIC, 2IC, procurement
 * officer, storekeeper) and enforced server-side by `can_manage_procurement()`.
 * Photos are stored privately and read through short-lived signed URLs.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShoppingCart, Plus, Loader2, Search, CheckCircle2, XCircle, PackageCheck, History,
  Image as ImageIcon, Trash2, Send, Wallet, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { DateInput } from "@/components/ui/date-input";
import {
  useProcurementRequests, useProcurementTrail, useProcurementPhotos,
  useCreateProcurementRequest, useSubmitProcurementRequest, useDecideProcurementRequest,
  useReceiveProcurementRequest, useUploadProcurementPhotos, useDeleteProcurementPhoto,
  useIsStorekeeperTier, isProcurementOpen, validateProcurementPhoto, useStockItemOptions,
  useProcurementBudgets, useProcurementUnitOptions, useSaveProcurementBudget,
  PROCUREMENT_PRIORITIES, type ProcurementRequest, type ProcurementPhoto,
} from "@/hooks/useProcurementRequests";
import { useAuth } from "@/hooks/useAuth";

const STATUS_CLASS: Record<string, string> = {
  draft: "border-muted bg-muted text-muted-foreground",
  submitted: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
  partial: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  received: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
};

const money = (n: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(n || 0);

const errMessage = (e: unknown) => (e as { message?: string })?.message || "Something went wrong";
const label = (v: string) => (v || "").replace(/_/g, " ");

/** Budget vs commitments per unit, with an overspend flag. */
function BudgetPanel({ canManage }: { canManage: boolean }) {
  const year = new Date().getFullYear();
  const { data: budgets = [], isLoading } = useProcurementBudgets(year);
  const { data: units = [] } = useProcurementUnitOptions(canManage);
  const save = useSaveProcurementBudget();
  const [editOpen, setEditOpen] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [amount, setAmount] = useState("");

  const over = budgets.filter((b) => b.over_budget);
  const unfunded = budgets.filter((b) => b.budget_amount === 0);

  const submit = async () => {
    if (!unitId) { toast.error("Select a unit"); return; }
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) { toast.error("Enter a valid budget amount"); return; }
    try {
      await save.mutateAsync({ org_unit_id: unitId, fiscal_year: year, budget_amount: value });
      toast.success("Budget saved");
      setEditOpen(false); setUnitId(""); setAmount("");
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
            Unit &amp; branch budgets — {year}
          </CardTitle>
          <CardDescription>
            {over.length > 0
              ? `${over.length} unit${over.length === 1 ? "" : "s"} over budget`
              : "No unit is over budget"}
            {unfunded.length > 0 ? ` · ${unfunded.length} with spend but no allocation` : ""}
            . Approved, partial and received requests count as committed; submitted requests are pending.
          </CardDescription>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Set budget
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading budgets…</p>}
        {!isLoading && budgets.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No budgets allocated yet{canManage ? " — use “Set budget” to allocate one." : "."}
          </p>
        )}
        {budgets.length > 0 && (
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((b) => (
                  <TableRow key={b.org_unit_id} className={b.over_budget ? "bg-destructive/5" : undefined}>
                    <TableCell className="font-medium">
                      {b.org_unit_name}
                      {b.org_unit_code && (
                        <span className="ml-2 text-xs text-muted-foreground">{b.org_unit_code}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{money(b.budget_amount)}</TableCell>
                    <TableCell className="text-right">{money(b.committed)}</TableCell>
                    <TableCell className="text-right">{money(b.pending)}</TableCell>
                    <TableCell className={`text-right font-medium ${b.remaining < 0 ? "text-destructive" : ""}`}>
                      {money(b.remaining)}
                    </TableCell>
                    <TableCell className="text-right">{b.request_count}</TableCell>
                    <TableCell>
                      {b.budget_amount === 0 ? (
                        <Badge variant="outline" className="text-muted-foreground">No allocation</Badge>
                      ) : b.over_budget ? (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                          Over budget{b.utilisation_pct != null ? ` · ${b.utilisation_pct}%` : ""}
                        </Badge>
                      ) : (b.utilisation_pct ?? 0) >= 80 ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                          {b.utilisation_pct}% used
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                          {b.utilisation_pct ?? 0}% used
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set {year} budget</DialogTitle>
            <DialogDescription>
              Allocates a fiscal-year procurement budget to a unit or branch. Existing allocations are replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="budget-unit">Unit / branch</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger id="budget-unit"><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{u.code ? ` (${u.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-amount">Budget amount (GHS)</Label>
              <Input id="budget-amount" type="number" min="0" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save budget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function ProcurementTab() {
  const { user } = useAuth();
  const canManage = useIsStorekeeperTier();
  const { data: requests = [], isLoading, error } = useProcurementRequests(180);
  const [openOnly, setOpenOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [detail, setDetail] = useState<ProcurementRequest | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (openOnly && !isProcurementOpen(r.status)) return false;
      if (!q) return true;
      return [r.pr_number, r.title, r.description, r.priority]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [requests, openOnly, search]);

  const awaiting = requests.filter((r) => r.status === "submitted").length;
  const approved = requests.filter((r) => ["approved", "partial"].includes(r.status)).length;
  const spend = requests
    .filter((r) => ["approved", "partial", "received"].includes(r.status))
    .reduce((s, r) => s + Number(r.estimated_cost || 0), 0);

  // Keep the open drawer in step with refreshed list data.
  const current = detail ? requests.find((r) => r.id === detail.id) ?? detail : null;

  return (
    <div className="space-y-4">
    <BudgetPanel canManage={canManage} />
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" aria-hidden="true" />
            Procurement requests
          </CardTitle>
          <CardDescription>
            {awaiting} awaiting approval · {approved} approved for receipt ·{" "}
            {money(spend)} committed (180 days)
            {canManage ? "" : " · view and raise only"}
          </CardDescription>
        </div>
        <Button onClick={() => setRaiseOpen(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          New request
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              className="pl-8"
              placeholder="Search reference, title or item"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search procurement requests"
            />
          </div>
          <Button variant={openOnly ? "default" : "outline"} onClick={() => setOpenOnly((v) => !v)}>
            Open only
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{errMessage(error)}</p>}

        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Estimate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Needed by</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No procurement requests for this filter.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => {
                const received = r.items.reduce((s, i) => s + Number(i.received_qty || 0), 0);
                const ordered = r.items.reduce((s, i) => s + Number(i.quantity || 0), 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.pr_number}</TableCell>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="capitalize">{label(r.priority)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {received}/{ordered} units
                    </TableCell>
                    <TableCell>{money(Number(r.estimated_cost || 0))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_CLASS[r.status] ?? ""}>
                        {label(r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.needed_by ? formatDate(r.needed_by) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setDetail(r)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <RaiseRequestDialog open={raiseOpen} onOpenChange={setRaiseOpen} />
      {current && (
        <RequestDetailDialog
          request={current}
          canManage={canManage}
          isOwner={current.requested_by === user?.id}
          onClose={() => setDetail(null)}
        />
      )}
    </Card>
    </div>
  );
}

/* ── Raise a request ──────────────────────────────────────────────────────── */

interface DraftLine {
  item_name: string;
  quantity: string;
  unit: string;
  estimated_unit_cost: string;
  /** "" = not linked to stock; otherwise an inventory_items.id */
  inventory_item_id: string;
}
const emptyLine: DraftLine = {
  item_name: "", quantity: "1", unit: "pcs", estimated_unit_cost: "0", inventory_item_id: "",
};
const NO_STOCK = "__none__";

function RaiseRequestDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateProcurementRequest();
  const { data: stockOptions = [] } = useStockItemOptions(open);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [neededBy, setNeededBy] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...emptyLine }]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [orgUnitId, setOrgUnitId] = useState("");
  const { data: units = [] } = useProcurementUnitOptions(open);
  const { data: budgets = [] } = useProcurementBudgets(new Date().getFullYear(), open);

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("normal"); setNeededBy("");
    setLines([{ ...emptyLine }]); setPhotos([]); setOrgUnitId("");
  };

  const estimate = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.estimated_unit_cost) || 0), 0,
  );

  const selectedBudget = budgets.find((b) => b.org_unit_id === orgUnitId && b.budget_amount > 0) ?? null;
  const overspend = !!selectedBudget && estimate > selectedBudget.remaining;

  const save = async (submit: boolean) => {
    if (!title.trim()) { toast.error("A request title is required"); return; }
    const items = lines
      .filter((l) => l.item_name.trim())
      .map((l) => ({
        item_name: l.item_name.trim(),
        quantity: Number(l.quantity) || 1,
        unit: l.unit.trim() || "pcs",
        estimated_unit_cost: Number(l.estimated_unit_cost) || 0,
        inventory_item_id: l.inventory_item_id || null,
      }));
    if (items.length === 0) { toast.error("Add at least one item line"); return; }
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        needed_by: neededBy || null,
        org_unit_id: orgUnitId || null,
        items,
        photos,
        submit,
      });
      toast.success(submit ? "Request submitted for approval" : "Draft request saved");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New procurement request</DialogTitle>
          <DialogDescription>
            Saved as a draft, or submitted straight to the storekeeper tier for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pr-title">Title</Label>
            <Input id="pr-title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Replacement patrol torches" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pr-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="pr-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROCUREMENT_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-needed">Needed by</Label>
              <DateInput id="pr-needed" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pr-unit">Charged to unit / branch</Label>
            <Select value={orgUnitId} onValueChange={setOrgUnitId}>
              <SelectTrigger id="pr-unit">
                <SelectValue placeholder="Select the unit whose budget this draws on" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}{u.code ? ` (${u.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBudget ? (
              <p className={`text-xs ${overspend ? "text-destructive" : "text-muted-foreground"}`}>
                {overspend && <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />}
                Budget {money(selectedBudget.budget_amount)} · committed {money(selectedBudget.committed)} ·
                pending {money(selectedBudget.pending)} · remaining {money(selectedBudget.remaining)}
                {overspend
                  ? ` — this request of ${money(estimate)} exceeds the remaining budget`
                  : ""}
              </p>
            ) : orgUnitId ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />
                No {new Date().getFullYear()} budget allocated to this unit yet — spend will show as unfunded.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pr-desc">Justification</Label>
            <Textarea id="pr-desc" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Why this is needed and where it will be used" />
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-5" placeholder="Item" value={l.item_name}
                    aria-label={`Item ${idx + 1} name`}
                    onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, item_name: e.target.value } : x))}
                  />
                  <Input
                    className="col-span-2" type="number" min="0" placeholder="Qty" value={l.quantity}
                    aria-label={`Item ${idx + 1} quantity`}
                    onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))}
                  />
                  <Input
                    className="col-span-2" placeholder="Unit" value={l.unit}
                    aria-label={`Item ${idx + 1} unit`}
                    onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}
                  />
                  <Input
                    className="col-span-2" type="number" min="0" placeholder="Unit cost" value={l.estimated_unit_cost}
                    aria-label={`Item ${idx + 1} unit cost`}
                    onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, estimated_unit_cost: e.target.value } : x))}
                  />
                  <Button
                    type="button" variant="ghost" size="icon" className="col-span-1"
                    aria-label={`Remove item ${idx + 1}`}
                    onClick={() => setLines((p) => (p.length === 1 ? [{ ...emptyLine }] : p.filter((_, i) => i !== idx)))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                  </Button>
                  <div className="col-span-11">
                    <Select
                      value={l.inventory_item_id || NO_STOCK}
                      onValueChange={(v) =>
                        setLines((p) =>
                          p.map((x, i) => {
                            if (i !== idx) return x;
                            if (v === NO_STOCK) return { ...x, inventory_item_id: "" };
                            const opt = stockOptions.find((o) => o.id === v);
                            return {
                              ...x,
                              inventory_item_id: v,
                              item_name: x.item_name.trim() || opt?.name || "",
                              unit: opt?.unit || x.unit,
                              estimated_unit_cost:
                                Number(x.estimated_unit_cost) > 0
                                  ? x.estimated_unit_cost
                                  : String(opt?.unit_cost ?? 0),
                            };
                          }),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-xs" aria-label={`Item ${idx + 1} stock link`}>
                        <SelectValue placeholder="Link to stock item (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_STOCK}>Not linked to stock</SelectItem>
                        {stockOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}{o.sku ? ` (${o.sku})` : ""} — {o.qty_on_hand} {o.unit} on hand
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, { ...emptyLine }])}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />Add item
              </Button>
              <p className="text-sm text-muted-foreground">Estimate: {money(estimate)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pr-photos">Photos (optional)</Label>
            <Input
              id="pr-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                const bad = (await Promise.all(files.map(validateProcurementPhoto))).find(Boolean);
                if (bad) { toast.error(bad); return; }
                setPhotos(files);
              }}
            />
            {photos.length > 0 && (
              <p className="text-xs text-muted-foreground">{photos.length} photo(s) attached</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={create.isPending}>
            Save draft
          </Button>
          <Button onClick={() => save(true)} disabled={create.isPending}>
            {create.isPending
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Send className="mr-1 h-4 w-4" aria-hidden="true" />}
            Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Detail: approve / receive / audit ────────────────────────────────────── */

function RequestDetailDialog({
  request, canManage, isOwner, onClose,
}: { request: ProcurementRequest; canManage: boolean; isOwner: boolean; onClose: () => void }) {
  const submit = useSubmitProcurementRequest();
  const decide = useDecideProcurementRequest();
  const receive = useReceiveProcurementRequest();
  const { data: trail = [] } = useProcurementTrail(request.id);
  const [note, setNote] = useState("");
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>(
    Object.fromEntries(request.items.map((i) => [i.id, String(i.received_qty ?? 0)])),
  );
  const [receiptPhotos, setReceiptPhotos] = useState<File[]>([]);

  const canApprove = canManage && request.status === "submitted";
  const canReceive = canManage && ["approved", "partial"].includes(request.status);
  const canSubmit = (isOwner || canManage) && request.status === "draft";

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); setNote(""); setReceiptPhotos([]); }
    catch (e) { toast.error(errMessage(e)); }
  };

  const busy = submit.isPending || decide.isPending || receive.isPending;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{request.pr_number}</span>
            {request.title}
          </DialogTitle>
          <DialogDescription className="capitalize">
            {label(request.status)} · {label(request.priority)} priority ·{" "}
            {money(Number(request.estimated_cost || 0))} estimate
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {request.description && <p className="text-sm text-muted-foreground">{request.description}</p>}
          {request.rejection_reason && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              Rejected: {request.rejection_reason}
            </p>
          )}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Unit cost</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {request.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.item_name}</TableCell>
                    <TableCell>{Number(i.quantity)} {i.unit}</TableCell>
                    <TableCell>{money(Number(i.estimated_unit_cost || 0))}</TableCell>
                    <TableCell>
                      {canReceive ? (
                        <Input
                          type="number" min="0" max={Number(i.quantity)} className="h-8 w-24"
                          aria-label={`Received quantity for ${i.item_name}`}
                          value={receiveQty[i.id] ?? "0"}
                          onChange={(e) => setReceiveQty((p) => ({ ...p, [i.id]: e.target.value }))}
                        />
                      ) : (
                        <span>{Number(i.received_qty || 0)} {i.unit}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {(canApprove || canReceive || canSubmit) && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Action</p>
              <Textarea
                aria-label="Action note"
                placeholder={canApprove ? "Required when rejecting" : "Note for the audit trail"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              {canReceive && (
                <div className="space-y-2">
                  <Label htmlFor="pr-receipt-photos">Delivery photos</Label>
                  <Input
                    id="pr-receipt-photos" type="file" multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      const bad = (await Promise.all(files.map(validateProcurementPhoto))).find(Boolean);
                      if (bad) { toast.error(bad); return; }
                      setReceiptPhotos(files);
                    }}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {canSubmit && (
                  <Button
                    disabled={busy}
                    onClick={() => run(() => submit.mutateAsync({ id: request.id, note }), "Request submitted")}
                  >
                    <Send className="mr-1 h-4 w-4" aria-hidden="true" />Submit
                  </Button>
                )}
                {canApprove && (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => run(() => decide.mutateAsync({ id: request.id, approve: true, note }), "Request approved")}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />Approve
                    </Button>
                    <Button
                      variant="destructive" disabled={busy}
                      onClick={() => run(() => decide.mutateAsync({ id: request.id, approve: false, note }), "Request rejected")}
                    >
                      <XCircle className="mr-1 h-4 w-4" aria-hidden="true" />Reject
                    </Button>
                  </>
                )}
                {canReceive && (
                  <Button
                    disabled={busy}
                    onClick={() => run(
                      () => receive.mutateAsync({
                        id: request.id,
                        items: request.items.map((i) => ({
                          id: i.id, received_qty: Number(receiveQty[i.id] ?? 0) || 0,
                        })),
                        note,
                        photos: receiptPhotos,
                      }),
                      "Goods received recorded",
                    )}
                  >
                    <PackageCheck className="mr-1 h-4 w-4" aria-hidden="true" />Record receipt
                  </Button>
                )}
              </div>
            </div>
          )}

          <PhotoSection requisitionId={request.id} canManage={canManage} />

          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-primary" aria-hidden="true" />
              Audit trail
            </p>
            {trail.length === 0 && <p className="text-sm text-muted-foreground">No entries yet.</p>}
            <div className="space-y-2">
              {trail.map((e) => (
                <div key={e.id} className="rounded-md border p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline" className={STATUS_CLASS[e.to_status ?? ""] ?? ""}>
                      {label(e.action)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {label(e.from_status ?? "—")} → {label(e.to_status ?? "—")} · by {e.actor_name ?? "Unknown"}
                  </p>
                  {e.note && <p className="mt-1">{e.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhotoSection({ requisitionId, canManage }: { requisitionId: string; canManage: boolean }) {
  const { data: photos = [], isLoading } = useProcurementPhotos(requisitionId);
  const upload = useUploadProcurementPhotos();
  const remove = useDeleteProcurementPhoto();

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ImageIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        Photos <span className="text-muted-foreground">({photos.length})</span>
      </p>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {photos.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {photos.map((p: ProcurementPhoto) => (
            <figure key={p.id} className="overflow-hidden rounded-md border">
              {p.signedUrl ? (
                <img
                  src={p.signedUrl} alt={p.caption || `Procurement ${p.kind} photo`}
                  loading="lazy" className="h-32 w-full object-cover"
                />
              ) : (
                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                  Preview unavailable
                </div>
              )}
              <figcaption className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground">
                <span className="capitalize">{label(p.kind)}</span>
                {canManage && (
                  <button
                    type="button" className="text-destructive hover:underline"
                    onClick={() => remove.mutate(p)}
                  >
                    Remove
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <Input
        type="file" multiple accept="image/jpeg,image/png,image/webp"
        aria-label="Attach procurement photos"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length === 0) return;
          const bad = (await Promise.all(files.map(validateProcurementPhoto))).find(Boolean);
          if (bad) { toast.error(bad); return; }
          try {
            await upload.mutateAsync({ requisitionId, files });
            toast.success("Photos attached");
          } catch (err) {
            toast.error(errMessage(err));
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
