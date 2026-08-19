/**
 * BULK VEHICLE REGISTRATION — paste or upload a CSV of the real fleet.
 *
 * Columns (header row required, order free):
 *   registration, call_sign, make, model, year, odometer_km, fuel_level_pct,
 *   fuel_capacity_litres, unit, driver_staff_id, device_id, status, notes
 *
 * Rows are matched to org units by name/code and to drivers by staff ID, then
 * upserted on registration number so re-running the import is safe.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2 } from "lucide-react";
import { VEHICLE_STATUS_LABELS, type VehicleStatus } from "@/lib/fleet";

const TEMPLATE =
  "registration,call_sign,make,model,year,odometer_km,fuel_level_pct,fuel_capacity_litres,unit,driver_staff_id,device_id,status,notes\n" +
  "GS-1234-25,ALPHA-1,Toyota,Hilux,2023,48200,65,80,Amasaman Sector,GIS-0142,TRK-1234,active,Sector patrol vehicle";

interface ParsedRow {
  registration_number: string;
  call_sign: string | null;
  make: string | null;
  model: string | null;
  model_year: number | null;
  odometer_km: number;
  last_fuel_level_pct: number | null;
  fuel_capacity_litres: number | null;
  unitText: string;
  driverText: string;
  device_id: string | null;
  status: VehicleStatus;
  notes: string | null;
  problem?: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim()); cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const num = (v: string) => {
  const n = Number((v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const cols = {
    reg: idx("registration", "registration_number", "reg", "reg_no"),
    call: idx("call_sign", "callsign"),
    make: idx("make"),
    model: idx("model"),
    year: idx("year", "model_year"),
    odo: idx("odometer_km", "odometer", "mileage"),
    fuel: idx("fuel_level_pct", "fuel", "fuel_pct"),
    cap: idx("fuel_capacity_litres", "tank_litres", "capacity"),
    unit: idx("unit", "assigned_unit", "org_unit"),
    driver: idx("driver_staff_id", "driver", "staff_id"),
    device: idx("device_id", "tracker", "tracker_id"),
    status: idx("status"),
    notes: idx("notes", "remarks"),
  };

  return lines.slice(1).map((line) => {
    const c = splitCsvLine(line);
    const at = (i: number) => (i >= 0 ? (c[i] ?? "") : "");
    const reg = at(cols.reg).toUpperCase();
    const statusRaw = at(cols.status).toLowerCase();
    const status = (Object.keys(VEHICLE_STATUS_LABELS) as VehicleStatus[]).includes(statusRaw as VehicleStatus)
      ? (statusRaw as VehicleStatus)
      : "active";
    const row: ParsedRow = {
      registration_number: reg,
      call_sign: at(cols.call) || null,
      make: at(cols.make) || null,
      model: at(cols.model) || null,
      model_year: num(at(cols.year)),
      odometer_km: num(at(cols.odo)) ?? 0,
      last_fuel_level_pct: num(at(cols.fuel)),
      fuel_capacity_litres: num(at(cols.cap)),
      unitText: at(cols.unit),
      driverText: at(cols.driver),
      device_id: at(cols.device) || null,
      status,
      notes: at(cols.notes) || null,
    };
    if (!row.registration_number) row.problem = "Registration number is required";
    return row;
  });
}

export function FleetVehicleImportDialog({ disabled }: { disabled?: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const unitsQuery = useQuery({
    queryKey: ["fleet", "import", "units"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("org_units").select("id, name, code").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const driversQuery = useQuery({
    queryKey: ["fleet", "import", "drivers"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("id, staff_id, first_name, last_name").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => parseCsv(text), [text]);
  const valid = rows.filter((r) => !r.problem);

  function resolveUnit(v: string) {
    const q = v.trim().toLowerCase();
    if (!q) return null;
    const u = (unitsQuery.data ?? []).find(
      (x) => x.name?.toLowerCase() === q || x.code?.toLowerCase() === q,
    );
    return u?.id ?? null;
  }

  function resolveDriver(v: string) {
    const q = v.trim().toLowerCase();
    if (!q) return null;
    const d = (driversQuery.data ?? []).find(
      (x) =>
        x.staff_id?.toLowerCase() === q ||
        `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim().toLowerCase() === q,
    );
    return d?.id ?? null;
  }

  async function commit() {
    if (valid.length === 0) {
      toast.error("Nothing to import — check the CSV header and rows");
      return;
    }
    setSaving(true);
    const payload = valid.map((r) => ({
      registration_number: r.registration_number,
      call_sign: r.call_sign,
      make: r.make,
      model: r.model,
      model_year: r.model_year,
      odometer_km: r.odometer_km,
      last_fuel_level_pct: r.last_fuel_level_pct,
      fuel_capacity_litres: r.fuel_capacity_litres,
      device_id: r.device_id,
      status: r.status,
      notes: r.notes,
      org_unit_id: resolveUnit(r.unitText),
      assigned_driver_id: resolveDriver(r.driverText),
      is_demo: false,
    }));
    const { error } = await supabase
      .from("fleet_vehicles")
      .upsert(payload, { onConflict: "registration_number" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${payload.length} vehicle(s) registered`);
    queryClient.invalidateQueries({ queryKey: ["fleet"] });
    setText("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Upload className="mr-1 h-4 w-4" aria-hidden="true" /> Bulk register
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk register vehicles</DialogTitle>
          <DialogDescription>
            Paste your real fleet as CSV. Existing registrations are updated, new ones are added.
            Units match on unit name or code; drivers match on staff ID or full name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="fleet-csv">Fleet CSV</Label>
            <Button size="sm" variant="ghost" onClick={() => setText(TEMPLATE)}>
              Insert template
            </Button>
          </div>
          <Textarea
            id="fleet-csv"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="font-mono text-xs"
            placeholder={TEMPLATE}
          />
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Upload fleet CSV"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
            }}
            className="text-sm"
          />

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Registration</TableHead>
                    <TableHead>Call sign</TableHead>
                    <TableHead>Make / model</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Odometer</TableHead>
                    <TableHead className="text-right">Fuel</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.registration_number}-${i}`}>
                      <TableCell className="font-mono text-xs">
                        {r.registration_number || "—"}
                        {r.problem && (
                          <Badge variant="outline" className="ml-2 border-destructive/40 text-destructive">
                            {r.problem}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{r.call_sign ?? "—"}</TableCell>
                      <TableCell>{[r.make, r.model].filter(Boolean).join(" ") || "—"}</TableCell>
                      <TableCell>{r.model_year ?? "—"}</TableCell>
                      <TableCell className="text-right">{r.odometer_km} km</TableCell>
                      <TableCell className="text-right">
                        {r.last_fuel_level_pct != null ? `${r.last_fuel_level_pct}%` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.unitText
                          ? resolveUnit(r.unitText)
                            ? r.unitText
                            : `${r.unitText} (no match)`
                          : "—"}
                      </TableCell>
                      <TableCell>{VEHICLE_STATUS_LABELS[r.status] ?? r.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={commit} disabled={saving || valid.length === 0}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            Register {valid.length || ""} vehicle(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FleetVehicleImportDialog;
