/** Geofence zones — circular or polygon, with enter/exit alerting. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, MapPinned } from "lucide-react";
import { format } from "date-fns";
import { SEVERITY_CLASSES, parsePolygon, type FleetGeofence } from "@/lib/fleet";

interface Props {
  geofences: FleetGeofence[];
  canManage: boolean;
}

interface FormState {
  name: string;
  description: string;
  kind: "circle" | "polygon";
  center_lat: string;
  center_lng: string;
  radius_m: string;
  polygonText: string;
  trigger_on: "enter" | "exit" | "both";
  severity: "info" | "warning" | "critical";
  active: boolean;
}

const EMPTY: FormState = {
  name: "", description: "", kind: "circle", center_lat: "", center_lng: "",
  radius_m: "500", polygonText: "", trigger_on: "both", severity: "warning", active: true,
};

export function FleetGeofencesTab({ geofences, canManage }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FleetGeofence | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<FleetGeofence | null>(null);

  const eventsQuery = useQuery({
    queryKey: ["fleet", "geofence-events"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fleet_geofence_events")
        .select("id, event_type, occurred_at, geofence_id, vehicle_id, fleet_vehicles(registration_number), fleet_geofences(name)")
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const startCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (g: FleetGeofence) => {
    setEditing(g);
    setForm({
      name: g.name,
      description: g.description ?? "",
      kind: g.kind,
      center_lat: g.center_lat?.toString() ?? "",
      center_lng: g.center_lng?.toString() ?? "",
      radius_m: g.radius_m?.toString() ?? "500",
      polygonText: parsePolygon(g.polygon).map(([a, b]) => `${a}, ${b}`).join("\n"),
      trigger_on: g.trigger_on,
      severity: g.severity,
      active: g.active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Zone name is required", variant: "destructive" });
      return;
    }
    let polygon: Array<[number, number]> | null = null;
    if (form.kind === "polygon") {
      polygon = form.polygonText
        .split("\n")
        .map((line) => line.split(",").map((n) => Number(n.trim())))
        .filter((p) => p.length >= 2 && p.every(Number.isFinite))
        .map((p) => [p[0], p[1]] as [number, number]);
      if (polygon.length < 3) {
        toast({ title: "A polygon zone needs at least three points", variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        kind: form.kind,
        center_lat: form.kind === "circle" ? Number(form.center_lat) : null,
        center_lng: form.kind === "circle" ? Number(form.center_lng) : null,
        radius_m: form.kind === "circle" ? Number(form.radius_m) : null,
        polygon: polygon as unknown as never,
        trigger_on: form.trigger_on,
        severity: form.severity,
        active: form.active,
      };
      if (editing) {
        const { error } = await supabase.from("fleet_geofences").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("fleet_geofences")
          .insert({ ...payload, created_by: authData.user?.id ?? null });
        if (error) throw error;
      }
      toast({ title: editing ? "Zone updated" : "Zone created" });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    } catch (error: any) {
      toast({ title: "Could not save zone", description: error?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("fleet_geofences").delete().eq("id", deleting.id);
    if (error) toast({ title: "Could not delete zone", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Zone deleted" });
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    }
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="h-5 w-5 text-primary" aria-hidden="true" />
              Geofence zones
            </CardTitle>
            <CardDescription>
              Entry and exit are evaluated on the server for every position received.
            </CardDescription>
          </div>
          {canManage && (
            <Button onClick={startCreate}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> New zone
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Zone</TableHead>
                  <TableHead>Shape</TableHead>
                  <TableHead>Alerts on</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {geofences.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No zones defined yet.
                    </TableCell>
                  </TableRow>
                )}
                {geofences.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <div className="font-medium">{g.name}</div>
                      {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {g.kind === "circle"
                        ? `Circle · ${Math.round(Number(g.radius_m ?? 0))} m`
                        : `Polygon · ${parsePolygon(g.polygon).length} points`}
                    </TableCell>
                    <TableCell className="capitalize">{g.trigger_on}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SEVERITY_CLASSES[g.severity]}>{g.severity}</Badge>
                    </TableCell>
                    <TableCell>{g.active ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => startEdit(g)} aria-label={`Edit ${g.name}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(g)} aria-label={`Delete ${g.name}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent zone crossings</CardTitle>
          <CardDescription>Latest 50 entries and exits recorded by the tracking service.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(eventsQuery.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No zone crossings recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {(eventsQuery.data ?? []).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(e.occurred_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell>{e.fleet_vehicles?.registration_number ?? "—"}</TableCell>
                    <TableCell>{e.fleet_geofences?.name ?? "—"}</TableCell>
                    <TableCell className="capitalize">{e.event_type}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit zone" : "New zone"}</DialogTitle>
            <DialogDescription>
              Circles use a centre point and radius; polygons take one “latitude, longitude” pair per line.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fg-name">Zone name *</Label>
              <Input id="fg-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fg-desc">Description</Label>
              <Input id="fg-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fg-kind">Shape</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as FormState["kind"] })}>
                <SelectTrigger id="fg-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="circle">Circle</SelectItem>
                  <SelectItem value="polygon">Polygon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fg-trigger">Alert on</Label>
              <Select value={form.trigger_on} onValueChange={(v) => setForm({ ...form, trigger_on: v as FormState["trigger_on"] })}>
                <SelectTrigger id="fg-trigger"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Entry and exit</SelectItem>
                  <SelectItem value="enter">Entry only</SelectItem>
                  <SelectItem value="exit">Exit only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.kind === "circle" ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="fg-lat">Centre latitude</Label>
                  <Input id="fg-lat" inputMode="decimal" value={form.center_lat}
                    onChange={(e) => setForm({ ...form, center_lat: e.target.value })} placeholder="5.6037" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fg-lng">Centre longitude</Label>
                  <Input id="fg-lng" inputMode="decimal" value={form.center_lng}
                    onChange={(e) => setForm({ ...form, center_lng: e.target.value })} placeholder="-0.1870" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fg-radius">Radius (metres)</Label>
                  <Input id="fg-radius" inputMode="numeric" value={form.radius_m}
                    onChange={(e) => setForm({ ...form, radius_m: e.target.value })} />
                </div>
              </>
            ) : (
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="fg-poly">Polygon points (one “lat, lng” per line)</Label>
                <Textarea id="fg-poly" rows={6} value={form.polygonText}
                  onChange={(e) => setForm({ ...form, polygonText: e.target.value })}
                  placeholder={"5.6100, -0.2000\n5.6100, -0.1700\n5.5900, -0.1700"} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="fg-sev">Severity</Label>
              <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as FormState["severity"] })}>
                <SelectTrigger id="fg-sev"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="fg-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label htmlFor="fg-active">Zone active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save zone"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Crossing history for this zone is removed with it. Existing alerts are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
