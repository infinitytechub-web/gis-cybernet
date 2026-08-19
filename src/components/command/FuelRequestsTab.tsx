/** Fuel requests — raise, approve/reject, issue, with an immutable audit trail. */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFleetVehicles } from "@/hooks/useFleet";
import { vehicleLabel } from "@/lib/fleet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Fuel, Plus, History, Check, X, Truck } from "lucide-react";

type FuelRequest = {
  id: string;
  request_number: string;
  vehicle_id: string | null;
  branch: string | null;
  fuel_type: string;
  litres_requested: number;
  litres_issued: number | null;
  odometer_km: number | null;
  estimated_cost_ghs: number | null;
  purpose: string;
  urgency: string;
  status: string;
  requested_by: string | null;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  issued_at: string | null;
  created_at: string;
};

type FuelRequestEvent = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_name: string | null;
  created_at: string;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  submitted: "secondary",
  approved: "default",
  issued: "outline",
  rejected: "destructive",
  cancelled: "outline",
};

interface Props {
  /** Command / fleet / procurement tier may approve, reject and issue. */
  canApprove: boolean;
  branchName?: string;
}

export function FuelRequestsTab({ canApprove, branchName }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const vehiclesQuery = useFleetVehicles();
  const vehicles = vehiclesQuery.data ?? [];

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [auditFor, setAuditFor] = useState<FuelRequest | null>(null);
  const [actionFor, setActionFor] = useState<{ req: FuelRequest; action: string } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionLitres, setActionLitres] = useState("");
  const [actionOdo, setActionOdo] = useState("");

  const [form, setForm] = useState({
    vehicle_id: "",
    fuel_type: "petrol",
    litres: "",
    odometer_km: "",
    estimated_cost_ghs: "",
    urgency: "normal",
    purpose: "",
  });

  const requestsQuery = useQuery({
    queryKey: ["fuel-requests", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("fuel_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter === "open") q = q.in("status", ["submitted", "approved"]);
      else if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FuelRequest[];
    },
  });

  const auditQuery = useQuery({
    queryKey: ["fuel-request-events", auditFor?.id],
    enabled: !!auditFor,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuel_request_events")
        .select("*")
        .eq("request_id", auditFor!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FuelRequestEvent[];
    },
  });

  const requests = requestsQuery.data ?? [];

  const kpis = useMemo(() => {
    const pending = requests.filter((r) => r.status === "submitted").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    const litresIssued = requests.reduce((sum, r) => sum + Number(r.litres_issued ?? 0), 0);
    const cost = requests
      .filter((r) => r.status === "issued")
      .reduce((sum, r) => sum + Number(r.estimated_cost_ghs ?? 0), 0);
    return { pending, approved, litresIssued, cost };
  }, [requests]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["fuel-requests"] });
    queryClient.invalidateQueries({ queryKey: ["fuel-request-events"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "fuel"] });
  };

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submitRequest = async () => {
    if (!form.litres.trim() || Number(form.litres) <= 0) {
      toast({ title: "Enter the litres required", variant: "destructive" });
      return;
    }
    if (!form.purpose.trim()) {
      toast({ title: "Purpose is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("fuel_request_create", {
        _vehicle_id: form.vehicle_id || null,
        _litres: Number(form.litres),
        _purpose: form.purpose.trim(),
        _fuel_type: form.fuel_type,
        _urgency: form.urgency,
        _odometer_km: num(form.odometer_km),
        _estimated_cost_ghs: num(form.estimated_cost_ghs),
        _org_unit_id: null,
        _branch: branchName ?? null,
      });
      if (error) throw error;
      toast({ title: "Fuel request submitted", description: "It now awaits approval." });
      setFormOpen(false);
      setForm({
        vehicle_id: "", fuel_type: "petrol", litres: "", odometer_km: "",
        estimated_cost_ghs: "", urgency: "normal", purpose: "",
      });
      refresh();
    } catch (error: any) {
      toast({ title: "Could not submit request", description: error?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const runAction = async () => {
    if (!actionFor) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("fuel_request_set_status", {
        _request_id: actionFor.req.id,
        _action: actionFor.action,
        _note: actionNote.trim() || null,
        _litres_issued: actionFor.action === "issue" ? num(actionLitres) : null,
        _odometer_km: actionFor.action === "issue" ? num(actionOdo) : null,
      });
      if (error) throw error;
      toast({ title: `Request ${actionFor.action === "issue" ? "issued" : `${actionFor.action}d`}` });
      setActionFor(null);
      setActionNote("");
      setActionLitres("");
      setActionOdo("");
      refresh();
    } catch (error: any) {
      toast({ title: "Action failed", description: error?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openAction = (req: FuelRequest, action: string) => {
    setActionFor({ req, action });
    setActionNote("");
    setActionLitres(String(req.litres_requested ?? ""));
    setActionOdo(req.odometer_km != null ? String(req.odometer_km) : "");
  };

  const regOf = (id: string | null) =>
    id ? vehicles.find((v) => v.id === id)?.registration_number ?? "—" : "Foot / general";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Awaiting approval</p>
          <p className="text-2xl font-semibold">{kpis.pending}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Approved, not issued</p>
          <p className="text-2xl font-semibold">{kpis.approved}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Litres issued</p>
          <p className="text-2xl font-semibold">{kpis.litresIssued.toFixed(1)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Issued value</p>
          <p className="text-2xl font-semibold">GHS {kpis.cost.toFixed(2)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5 text-primary" aria-hidden="true" />
              Fuel requests
            </CardTitle>
            <CardDescription>
              Raise a fuel request, route it for approval, then record the issue. Every action is
              written to a tamper-proof audit trail and issued fuel posts to the vehicle fuel log.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open requests</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="all">Any status</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> New fuel request
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="text-right">Litres</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestsQuery.isLoading && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Loading fuel requests…
                  </TableCell></TableRow>
                )}
                {!requestsQuery.isLoading && requests.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No fuel requests for this filter.
                  </TableCell></TableRow>
                )}
                {requests.map((r) => {
                  const mine = r.requested_by === user?.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium">{r.request_number}</span>
                        <span className="block text-xs text-muted-foreground">
                          {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {regOf(r.vehicle_id)}
                        </span>
                        <span className="block text-xs capitalize text-muted-foreground">{r.fuel_type}</span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={r.purpose}>{r.purpose}</TableCell>
                      <TableCell className="text-right">
                        {Number(r.litres_requested).toFixed(1)}
                        {r.litres_issued != null && (
                          <span className="block text-xs text-muted-foreground">
                            issued {Number(r.litres_issued).toFixed(1)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{r.urgency}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{r.requested_by_name ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setAuditFor(r)}>
                            <History className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Audit
                          </Button>
                          {canApprove && r.status === "submitted" && (
                            <>
                              <Button size="sm" onClick={() => openAction(r, "approve")}>
                                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => openAction(r, "reject")}>
                                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Reject
                              </Button>
                            </>
                          )}
                          {canApprove && r.status === "approved" && (
                            <Button size="sm" onClick={() => openAction(r, "issue")}>
                              <Fuel className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Issue fuel
                            </Button>
                          )}
                          {(mine || canApprove) && ["submitted", "approved"].includes(r.status) && (
                            <Button size="sm" variant="outline" onClick={() => openAction(r, "cancel")}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── New request ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New fuel request</DialogTitle>
            <DialogDescription>
              Requests route to the command, fleet or procurement tier for approval.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fr-vehicle">Vehicle (optional)</Label>
              <Select value={form.vehicle_id || "none"} onValueChange={(v) => setForm({ ...form, vehicle_id: v === "none" ? "" : v })}>
                <SelectTrigger id="fr-vehicle"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vehicle (generator / general)</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fr-type">Fuel type</Label>
              <Select value={form.fuel_type} onValueChange={(v) => setForm({ ...form, fuel_type: v })}>
                <SelectTrigger id="fr-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="petrol">Petrol</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="lubricant">Lubricant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fr-urgency">Urgency</Label>
              <Select value={form.urgency} onValueChange={(v) => setForm({ ...form, urgency: v })}>
                <SelectTrigger id="fr-urgency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fr-litres">Litres required</Label>
              <Input id="fr-litres" inputMode="decimal" value={form.litres}
                onChange={(e) => setForm({ ...form, litres: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fr-odo">Current odometer (km)</Label>
              <Input id="fr-odo" inputMode="decimal" value={form.odometer_km}
                onChange={(e) => setForm({ ...form, odometer_km: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fr-cost">Estimated cost (GHS)</Label>
              <Input id="fr-cost" inputMode="decimal" value={form.estimated_cost_ghs}
                onChange={(e) => setForm({ ...form, estimated_cost_ghs: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fr-purpose">Purpose / operation</Label>
              <Textarea id="fr-purpose" rows={3} value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="e.g. Night patrol, Amasaman to Nsawam corridor" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitRequest} disabled={saving}>
              {saving ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approve / reject / issue / cancel ───────────────────────── */}
      <Dialog open={!!actionFor} onOpenChange={(o) => !o && setActionFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {actionFor?.action === "issue" ? "Issue fuel" : `${actionFor?.action ?? ""} request`}
            </DialogTitle>
            <DialogDescription>
              {actionFor?.req.request_number} — {actionFor?.req.purpose}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {actionFor?.action === "issue" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="fr-issue-litres">Litres issued</Label>
                  <Input id="fr-issue-litres" inputMode="decimal" value={actionLitres}
                    onChange={(e) => setActionLitres(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fr-issue-odo">Odometer at issue (km)</Label>
                  <Input id="fr-issue-odo" inputMode="decimal" value={actionOdo}
                    onChange={(e) => setActionOdo(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="fr-note">Note {actionFor?.action === "reject" ? "(reason)" : "(optional)"}</Label>
              <Textarea id="fr-note" rows={3} value={actionNote}
                onChange={(e) => setActionNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionFor(null)}>Close</Button>
            <Button onClick={runAction} disabled={saving}>{saving ? "Working…" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Audit trail ─────────────────────────────────────────────── */}
      <Dialog open={!!auditFor} onOpenChange={(o) => !o && setAuditFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit trail — {auditFor?.request_number}</DialogTitle>
            <DialogDescription>Every action on this request, in order. Entries cannot be changed.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(auditQuery.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No audit entries yet.
                  </TableCell></TableRow>
                )}
                {(auditQuery.data ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(e.created_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="capitalize">{e.action}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.from_status ? `${e.from_status} → ${e.to_status}` : e.to_status}
                    </TableCell>
                    <TableCell className="text-sm">{e.actor_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
