/**
 * CYBER INCIDENT MODULE — threat type, source, impact and resolution.
 *
 * Incidents are branch-scoped by RLS and feed straight into the readiness
 * dashboards (the `command_dashboard` RPC counts open cyber incidents per
 * command) and into the Command Console live feed.
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
import { ShieldAlert, Plus, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/date-format";
import { ORG_UNIT_TYPE_LABELS, flattenOrgTree, orgUnitPath } from "@/lib/org-hierarchy";
import type { OrgUnit, OrgTreeNode } from "@/lib/org-hierarchy";
import {
  useCyberIncidents, useCreateCyberIncident, useUpdateCyberIncident, isCyberOpen,
  CYBER_THREAT_TYPES, CYBER_SOURCES, CYBER_IMPACT_LEVELS, CYBER_SEVERITIES, CYBER_STATUSES,
  type CyberIncident, type CyberStatus,
} from "@/hooks/useCyberIncidents";

const label = (v: string) => v.replace(/_/g, " ");

const SEVERITY_CLASS: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  info: "border-muted bg-muted text-muted-foreground",
};

function errMessage(e: unknown) {
  return (e as { message?: string })?.message || "Something went wrong";
}

export default function CyberIncidentsTab({
  units, tree, canManage,
}: { units: OrgUnit[]; tree: OrgTreeNode[]; canManage: boolean }) {
  const { data: incidents = [], isLoading, error } = useCyberIncidents(90);
  const [openOnly, setOpenOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CyberIncident | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incidents.filter((i) => {
      if (openOnly && !isCyberOpen(i.status)) return false;
      if (!q) return true;
      return [i.incident_number, i.title, i.incident_type, i.threat_source, i.affected_systems]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [incidents, openOnly, search]);

  const open = incidents.filter((i) => isCyberOpen(i.status)).length;
  const critical = incidents.filter((i) => isCyberOpen(i.status) && i.severity === "critical").length;
  const resolved = incidents.length - open;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-primary" aria-hidden="true" />
              Cyber incidents
            </CardTitle>
            <CardDescription>
              {open} open · {critical} critical · {resolved} resolved (90 days, my command only)
            </CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Log cyber incident
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={openOnly ? "default" : "outline"}
              onClick={() => setOpenOnly((v) => !v)}
            >
              {openOnly ? "Open only" : "All statuses"}
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, threat, system…"
                className="w-[260px] pl-8"
                aria-label="Search cyber incidents"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">Could not load incidents: {errMessage(error)}</p>
          )}

          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Threat type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      Loading incidents…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No cyber incidents for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{i.incident_number}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="truncate font-medium">{i.title}</div>
                        <div className="truncate text-xs capitalize text-muted-foreground">
                          {label(i.incident_type)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{label(i.threat_source ?? i.source ?? "unknown")}</TableCell>
                      <TableCell className="text-xs capitalize">{label(i.impact_level)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${SEVERITY_CLASS[i.severity] ?? ""}`}>
                          {i.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isCyberOpen(i.status) ? "default" : "secondary"} className="capitalize">
                          {label(i.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                        {i.org_unit_id ? orgUnitPath(units, i.org_unit_id) || "—" : "Unattributed"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(i.reported_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditing(i); setFormOpen(true); }}
                        >
                          {canManage ? "Update" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {formOpen && (
        <CyberIncidentDialog
          incident={editing}
          tree={tree}
          canManage={canManage}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}

function CyberIncidentDialog({
  incident, tree, canManage, onClose,
}: { incident: CyberIncident | null; tree: OrgTreeNode[]; canManage: boolean; onClose: () => void }) {
  const create = useCreateCyberIncident();
  const update = useUpdateCyberIncident();
  const unitOptions = useMemo(() => flattenOrgTree(tree), [tree]);

  const [title, setTitle] = useState(incident?.title ?? "");
  const [description, setDescription] = useState(incident?.description ?? "");
  const [threatType, setThreatType] = useState(incident?.incident_type ?? "phishing");
  const [threatSource, setThreatSource] = useState(incident?.threat_source ?? incident?.source ?? "unknown");
  const [impact, setImpact] = useState(incident?.impact_level ?? "unknown");
  const [impactNotes, setImpactNotes] = useState(incident?.impact_assessment ?? "");
  const [severity, setSeverity] = useState(incident?.severity ?? "medium");
  const [status, setStatus] = useState<CyberStatus>((incident?.status as CyberStatus) ?? "new");
  const [systems, setSystems] = useState(incident?.affected_systems ?? "");
  const [resolution, setResolution] = useState(incident?.resolution_notes ?? "");
  const [orgUnitId, setOrgUnitId] = useState(incident?.org_unit_id ?? "auto");

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    try {
      const payload = {
        title,
        description: description || null,
        incident_type: threatType,
        severity,
        status,
        threat_source: threatSource,
        impact_level: impact,
        impact_assessment: impactNotes || null,
        affected_systems: systems || null,
        resolution_notes: resolution || null,
        org_unit_id: orgUnitId === "auto" ? null : orgUnitId,
      };
      if (incident) {
        await update.mutateAsync({ id: incident.id, ...payload });
        toast.success("Cyber incident updated");
      } else {
        const row = await create.mutateAsync(payload);
        toast.success(`Cyber incident logged (${row?.incident_number ?? "saved"})`);
      }
      onClose();
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  const readOnly = !canManage;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {incident ? `${incident.incident_number} — ${incident.title}` : "Log a cyber incident"}
          </DialogTitle>
          <DialogDescription>
            Threat type, source, impact and resolution. Open incidents count against your command's
            readiness score.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="cy-title">Title</Label>
            <Input id="cy-title" value={title} disabled={readOnly}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fraudulent visa-fee payment site" />
          </div>

          <div className="space-y-1">
            <Label>Threat type</Label>
            <Select value={threatType} onValueChange={setThreatType} disabled={readOnly}>
              <SelectTrigger aria-label="Threat type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CYBER_THREAT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{label(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Source</Label>
            <Select value={threatSource} onValueChange={setThreatSource} disabled={readOnly}>
              <SelectTrigger aria-label="Source"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CYBER_SOURCES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{label(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Impact level</Label>
            <Select value={impact} onValueChange={setImpact} disabled={readOnly}>
              <SelectTrigger aria-label="Impact level"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CYBER_IMPACT_LEVELS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{label(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={setSeverity} disabled={readOnly}>
              <SelectTrigger aria-label="Severity"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CYBER_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CyberStatus)} disabled={readOnly}>
              <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CYBER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{label(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Command</Label>
            <Select value={orgUnitId} onValueChange={setOrgUnitId} disabled={readOnly}>
              <SelectTrigger aria-label="Command"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">My posting (automatic)</SelectItem>
                {unitOptions.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {"— ".repeat(n.depth)}{n.name} · {ORG_UNIT_TYPE_LABELS[n.type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="cy-systems">Affected systems</Label>
            <Input id="cy-systems" value={systems} disabled={readOnly}
              onChange={(e) => setSystems(e.target.value)}
              placeholder="e.g. Front desk workstation 3, staff mailbox" />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="cy-desc">Description</Label>
            <Textarea id="cy-desc" rows={3} value={description} disabled={readOnly}
              onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="cy-impact">Impact assessment</Label>
            <Textarea id="cy-impact" rows={2} value={impactNotes} disabled={readOnly}
              onChange={(e) => setImpactNotes(e.target.value)}
              placeholder="Data, service or reputational impact" />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="cy-res">Resolution</Label>
            <Textarea id="cy-res" rows={2} value={resolution} disabled={readOnly}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Containment and remediation steps" />
          </div>

          {incident?.resolved_at && (
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Resolved {formatDateTime(incident.resolved_at)}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canManage && (
            <Button onClick={submit} disabled={pending || !title.trim()}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {incident ? "Save changes" : "Log incident"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
