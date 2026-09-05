/**
 * COMMAND CONSOLE INBOX
 *
 * Officers raise, assign, progress and close command alerts here. Each write
 * calls a security-definer RPC that re-checks authority server-side and writes
 * an immutable entry into the alert's audit trail, shown in the detail drawer.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Inbox, Plus, UserCheck, CheckCircle2, History, Loader2, Search, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAlertPhotos, useUploadAlertPhotos, useDeleteAlertPhoto, validatePhoto,
} from "@/hooks/useAlertPhotos";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/date-format";
import { ORG_UNIT_TYPE_LABELS, flattenOrgTree, orgUnitPath } from "@/lib/org-hierarchy";
import type { OrgUnit, OrgTreeNode } from "@/lib/org-hierarchy";
import {
  useCommandAlerts, useCommandAlertTrail, useStaffDirectoryLite,
  useCreateCommandAlert, useAssignCommandAlert, useSetCommandAlertStatus, useAddCommandAlertNote,
  COMMAND_ALERT_STATUS_LABELS, COMMAND_ALERT_STATUSES, COMMAND_ALERT_SEVERITIES,
  COMMAND_ALERT_CATEGORIES, OPEN_COMMAND_ALERT_STATUSES,
  type CommandAlert, type CommandAlertSeverity, type CommandAlertStatus,
} from "@/hooks/useCommandAlerts";

const SEVERITY_CLASS: Record<CommandAlertSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  info: "border-muted bg-muted text-muted-foreground",
};

const ACTION_LABELS: Record<string, string> = {
  created: "Alert raised",
  assigned: "Assigned",
  status_changed: "Status changed",
  closed: "Closed",
  reopened: "Reopened",
  note: "Progress note",
};

function errMessage(e: unknown) {
  const m = (e as { message?: string })?.message ?? "";
  return m.replace(/^.*?: /, "") || "Something went wrong";
}

export default function CommandInboxTab({
  units, tree, canManage,
}: { units: OrgUnit[]; tree: OrgTreeNode[]; canManage: boolean }) {
  const { user } = useAuth();
  const { data: alerts = [], isLoading, error } = useCommandAlerts();
  const { data: staff = [] } = useStaffDirectoryLite();

  const [statusFilter, setStatusFilter] = useState<CommandAlertStatus | "open" | "all">("open");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const staffName = (id: string | null | undefined) => {
    if (!id) return "Unassigned";
    const s = staff.find((r) => r.user_id === id);
    return s ? `${s.first_name} ${s.last_name}${s.staff_id ? ` · ${s.staff_id}` : ""}` : "—";
  };
  const unitName = (id: string | null) => (id ? orgUnitPath(units, id) || "—" : "Command-wide");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts.filter((a) => {
      if (statusFilter === "open" && !OPEN_COMMAND_ALERT_STATUSES.includes(a.status)) return false;
      if (statusFilter !== "open" && statusFilter !== "all" && a.status !== statusFilter) return false;
      if (mineOnly && a.assigned_to !== user?.id) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.reference.toLowerCase().includes(q) ||
        (a.detail ?? "").toLowerCase().includes(q) ||
        (a.location ?? "").toLowerCase().includes(q)
      );
    });
  }, [alerts, statusFilter, mineOnly, search, user?.id]);

  const openCount = alerts.filter((a) => OPEN_COMMAND_ALERT_STATUSES.includes(a.status)).length;
  const mine = alerts.filter(
    (a) => a.assigned_to === user?.id && OPEN_COMMAND_ALERT_STATUSES.includes(a.status),
  ).length;
  const unassigned = alerts.filter((a) => !a.assigned_to && a.status !== "closed").length;
  const detail = alerts.find((a) => a.id === detailId) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-primary" aria-hidden="true" />
              Command inbox
            </CardTitle>
            <CardDescription>
              {openCount} outstanding · {unassigned} unassigned · {mine} assigned to me
            </CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Raise alert
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[180px]" aria-label="Inbox status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Outstanding</SelectItem>
                <SelectItem value="all">Any status</SelectItem>
                {COMMAND_ALERT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{COMMAND_ALERT_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={mineOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setMineOnly((v) => !v)}
            >
              <UserCheck className="mr-1 h-4 w-4" aria-hidden="true" />
              Assigned to me
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, title…"
                className="w-[240px] pl-8"
                aria-label="Search command inbox"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">Could not load the inbox: {errMessage(error)}</p>
          )}

          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Loading inbox…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No alerts in the inbox for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{a.reference}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate font-medium">{a.title}</div>
                        {(a.location || a.detail) && (
                          <div className="truncate text-xs text-muted-foreground">
                            {[a.location, a.detail].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {unitName(a.org_unit_id)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${SEVERITY_CLASS[a.severity]}`}>
                          {a.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.status === "closed" ? "secondary" : "default"}>
                          {COMMAND_ALERT_STATUS_LABELS[a.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[170px] truncate text-xs">{staffName(a.assigned_to)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(a.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDetailId(a.id)}>
                          Manage
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

      <RaiseAlertDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tree={tree}
        staff={staff}
      />

      <AlertDetailDialog
        alert={detail}
        onClose={() => setDetailId(null)}
        canManage={canManage}
        staff={staff}
        staffName={staffName}
        unitName={unitName}
      />
    </div>
  );
}

type StaffLite = { user_id: string; staff_id: string | null; first_name: string; last_name: string; status: string | null };

function StaffSelect({
  value, onChange, staff, placeholder = "Unassigned",
}: { value: string | null; onChange: (v: string | null) => void; staff: StaffLite[]; placeholder?: string }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const active = staff.filter((s) => (s.status ?? "active") === "active");
    const pool = needle
      ? active.filter((s) =>
          `${s.first_name} ${s.last_name} ${s.staff_id ?? ""}`.toLowerCase().includes(needle))
      : active;
    return pool.slice(0, 50);
  }, [staff, q]);

  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) => onChange(v === "none" ? null : v)}
    >
      <SelectTrigger aria-label="Assign to"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <div className="p-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search staff…"
            aria-label="Search staff"
          />
        </div>
        <SelectItem value="none">Unassigned</SelectItem>
        {list.map((s) => (
          <SelectItem key={s.user_id} value={s.user_id}>
            {s.first_name} {s.last_name}{s.staff_id ? ` · ${s.staff_id}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RaiseAlertDialog({
  open, onOpenChange, tree, staff,
}: { open: boolean; onOpenChange: (v: boolean) => void; tree: OrgTreeNode[]; staff: StaffLite[] }) {
  const create = useCreateCommandAlert();
  const uploadPhotos = useUploadAlertPhotos();
  const [photos, setPhotos] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [severity, setSeverity] = useState<CommandAlertSeverity>("medium");
  const [category, setCategory] = useState("general");
  const [orgUnitId, setOrgUnitId] = useState<string>("none");
  const [location, setLocation] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState("");

  const unitOptions = useMemo(() => flattenOrgTree(tree), [tree]);

  const reset = () => {
    setTitle(""); setDetail(""); setSeverity("medium"); setCategory("general");
    setOrgUnitId("none"); setLocation(""); setAssignedTo(null); setDueAt(""); setPhotos([]);
  };

  const submit = async () => {
    try {
      const alertId = await create.mutateAsync({
        title,
        detail: detail || null,
        severity,
        category,
        org_unit_id: orgUnitId === "none" ? null : orgUnitId,
        location: location || null,
        assigned_to: assignedTo,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      });
      if (photos.length > 0 && alertId) {
        try {
          await uploadPhotos.mutateAsync({ alertId, files: photos });
        } catch (e) {
          // The alert itself is saved; surface the photo problem separately.
          toast.error(`Alert raised, but photos failed: ${errMessage(e)}`);
        }
      }
      toast.success("Command alert raised");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise a command alert</DialogTitle>
          <DialogDescription>
            Logged with a reference number and an audit entry naming you as the raiser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="ca-title">Title</Label>
            <Input id="ca-title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Unauthorised entry at north perimeter" />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="ca-detail">Detail</Label>
            <Textarea id="ca-detail" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)}
              placeholder="What happened, what is required" />
          </div>
          <div className="space-y-1">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as CommandAlertSeverity)}>
              <SelectTrigger aria-label="Severity"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMMAND_ALERT_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMMAND_ALERT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Command</Label>
            <Select value={orgUnitId} onValueChange={setOrgUnitId}>
              <SelectTrigger aria-label="Command"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Command-wide</SelectItem>
                {unitOptions.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {"— ".repeat(n.depth)}{n.name} · {ORG_UNIT_TYPE_LABELS[n.type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ca-loc">Location</Label>
            <Input id="ca-loc" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label>Assign to</Label>
            <StaffSelect value={assignedTo} onChange={setAssignedTo} staff={staff} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ca-due">Due by</Label>
            <Input id="ca-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="ca-photos">Photos</Label>
            <Input
              id="ca-photos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                const bad = picked.map(validatePhoto).find(Boolean);
                if (bad) { toast.error(bad); return; }
                setPhotos(picked);
              }}
            />
            <p className="text-xs text-muted-foreground">
              JPEG, PNG or WebP under 3MB each, virus scanned. Stored privately against this alert.
              {photos.length > 0 ? ` ${photos.length} selected.` : ""}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {uploadPhotos.isPending ? "Uploading photos…" : "Raise alert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertDetailDialog({
  alert, onClose, canManage, staff, staffName, unitName,
}: {
  alert: CommandAlert | null;
  onClose: () => void;
  canManage: boolean;
  staff: StaffLite[];
  staffName: (id: string | null | undefined) => string;
  unitName: (id: string | null) => string;
}) {
  const { user } = useAuth();
  const { data: trail = [], isLoading: trailLoading } = useCommandAlertTrail(alert?.id ?? null);
  const assign = useAssignCommandAlert();
  const setStatus = useSetCommandAlertStatus();
  const addNote = useAddCommandAlertNote();

  const [assignee, setAssignee] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatusValue] = useState<CommandAlertStatus | "">("");

  if (!alert) return null;
  const isAssignee = alert.assigned_to === user?.id;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      setNote("");
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  const statusOptions: CommandAlertStatus[] = canManage
    ? COMMAND_ALERT_STATUSES
    : ["in_progress", "escalated"];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{alert.reference}</span>
            {alert.title}
          </DialogTitle>
          <DialogDescription>
            {[
              COMMAND_ALERT_STATUS_LABELS[alert.status],
              alert.severity,
              unitName(alert.org_unit_id),
              alert.location,
            ].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Raised by:</span> {staffName(alert.created_by)}</div>
              <div><span className="text-muted-foreground">Raised:</span> {formatDateTime(alert.created_at)}</div>
              <div><span className="text-muted-foreground">Assigned to:</span> {staffName(alert.assigned_to)}</div>
              <div><span className="text-muted-foreground">Due:</span> {alert.due_at ? formatDateTime(alert.due_at) : "—"}</div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Category:</span>{" "}
                <span className="capitalize">{alert.category}</span>
              </div>
            </div>
            {alert.detail && <p className="mt-2 whitespace-pre-wrap text-sm">{alert.detail}</p>}
            {alert.closing_notes && (
              <p className="mt-2 rounded bg-muted p-2 text-xs">
                <strong>Closing notes:</strong> {alert.closing_notes}
              </p>
            )}
          </div>

          {(canManage || isAssignee) && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Update this alert</p>
              {canManage && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-[280px] space-y-1">
                    <Label>Assign to</Label>
                    <StaffSelect value={assignee} onChange={setAssignee} staff={staff} />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!assignee || assign.isPending}
                    onClick={() => run(
                      () => assign.mutateAsync({ alertId: alert.id, assignedTo: assignee as string, note: note || null }),
                      "Alert assigned",
                    )}
                  >
                    <UserCheck className="mr-1 h-4 w-4" aria-hidden="true" />Assign
                  </Button>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="ca-note">Note</Label>
                <Textarea
                  id="ca-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Required when closing an alert"
                />
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="w-[200px] space-y-1">
                  <Label>Set status</Label>
                  <Select value={status} onValueChange={(v) => setStatusValue(v as CommandAlertStatus)}>
                    <SelectTrigger aria-label="Set status"><SelectValue placeholder="Choose status" /></SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>{COMMAND_ALERT_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!status || setStatus.isPending}
                  onClick={() => run(
                    () => setStatus.mutateAsync({ alertId: alert.id, status: status as CommandAlertStatus, note: note || null }),
                    "Status updated",
                  )}
                >
                  Apply status
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!note.trim() || addNote.isPending}
                  onClick={() => run(
                    () => addNote.mutateAsync({ alertId: alert.id, note }),
                    "Note recorded",
                  )}
                >
                  Add note only
                </Button>
                {canManage && alert.status !== "closed" && (
                  <Button
                    size="sm"
                    disabled={!note.trim() || setStatus.isPending}
                    onClick={() => run(
                      () => setStatus.mutateAsync({ alertId: alert.id, status: "closed", note }),
                      "Alert closed",
                    )}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />Close alert
                  </Button>
                )}
              </div>
            </div>
          )}

          <AlertPhotoSection alertId={alert.id} canManage={canManage} />

          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-primary" aria-hidden="true" />
              Audit trail
            </p>
            {trailLoading ? (
              <p className="text-sm text-muted-foreground">Loading trail…</p>
            ) : trail.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries yet.</p>
            ) : (
              <ol className="space-y-2">
                {trail.map((e) => (
                  <li key={e.id} className="rounded-md border p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{ACTION_LABELS[e.action] ?? e.action}</Badge>
                      {e.from_status && e.to_status && (
                        <span className="text-muted-foreground">
                          {COMMAND_ALERT_STATUS_LABELS[e.from_status]} → {COMMAND_ALERT_STATUS_LABELS[e.to_status]}
                        </span>
                      )}
                      {e.assigned_to && (
                        <span className="text-muted-foreground">→ {staffName(e.assigned_to)}</span>
                      )}
                      <span className="ml-auto text-muted-foreground">{formatDateTime(e.created_at)}</span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      By {staffName(e.actor_id)}{e.note ? ` · ${e.note}` : ""}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Photos attached to an alert. Objects live in a private bucket, so each image
 * is fetched through a short-lived signed URL rather than a public link.
 */
function AlertPhotoSection({ alertId, canManage }: { alertId: string; canManage: boolean }) {
  const { data: photos = [], isLoading } = useAlertPhotos(alertId);
  const upload = useUploadAlertPhotos();
  const remove = useDeleteAlertPhoto();

  const add = async (files: File[]) => {
    const bad = (await Promise.all(files.map(validatePhoto))).find(Boolean);
    if (bad) { toast.error(bad); return; }
    try {
      await upload.mutateAsync({ alertId, files });
      toast.success("Photos attached");
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ImageIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        Photos {photos.length > 0 && <span className="text-muted-foreground">({photos.length})</span>}
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading photos…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos attached.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((ph) => (
            <figure key={ph.id} className="overflow-hidden rounded-md border">
              {ph.signedUrl ? (
                <a href={ph.signedUrl} target="_blank" rel="noreferrer">
                  <img
                    src={ph.signedUrl}
                    alt={ph.caption || "Incident photo"}
                    loading="lazy"
                    className="h-28 w-full object-cover"
                  />
                </a>
              ) : (
                <div className="flex h-28 items-center justify-center bg-muted text-xs text-muted-foreground">
                  Preview unavailable
                </div>
              )}
              <figcaption className="flex items-center justify-between gap-1 p-1 text-[11px] text-muted-foreground">
                <span className="truncate">{formatDateTime(ph.created_at)}</span>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 text-destructive"
                    onClick={async () => {
                      try {
                        await remove.mutateAsync({ photo: ph });
                        toast.success("Photo removed");
                      } catch (e) {
                        toast.error(errMessage(e));
                      }
                    }}
                  >
                    Remove
                  </Button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {canManage && (
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-label="Attach photos to this alert"
          disabled={upload.isPending}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length) void add(picked);
            e.target.value = "";
          }}
        />
      )}
    </div>
  );
}
