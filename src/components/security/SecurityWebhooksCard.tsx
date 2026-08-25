import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Webhook, Pencil } from "lucide-react";

type WebhookRow = {
  id: string;
  label: string;
  kind: "slack" | "generic";
  url_preview: string;
  min_severity: "medium" | "high" | "critical";
  throttle_minutes: number;
  enabled: boolean;
  last_sent_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
};

const fmtDateTime = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Draft = {
  id: string | null;
  label: string;
  kind: "slack" | "generic";
  url: string;
  min_severity: "medium" | "high" | "critical";
  throttle_minutes: number;
  enabled: boolean;
};

const emptyDraft: Draft = {
  id: null,
  label: "",
  kind: "slack",
  url: "",
  min_severity: "high",
  throttle_minutes: 15,
  enabled: true,
};

export function SecurityWebhooksCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookRow | null>(null);

  const { data: hooks = [], isLoading } = useQuery({
    queryKey: ["security-monitor-webhooks"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("security_monitor_webhooks_list" as any);
      if (error) throw error;
      return (data ?? []) as unknown as WebhookRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const { error } = await supabase.rpc("security_monitor_webhook_save" as any, {
        _id: d.id,
        _label: d.label.trim(),
        _kind: d.kind,
        _url: d.url.trim() ? d.url.trim() : null,
        _min_severity: d.min_severity,
        _throttle_minutes: d.throttle_minutes,
        _enabled: d.enabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Webhook destination saved");
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["security-monitor-webhooks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save webhook"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("security_monitor_webhook_delete" as any, { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Webhook destination removed");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["security-monitor-webhooks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove webhook"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-4 w-4" aria-hidden /> Alert delivery (Slack / webhook)
          </CardTitle>
          <CardDescription>
            New alerts are pushed to each enabled destination with severity-based formatting. Destination URLs are
            write-only — only a masked preview is shown.
          </CardDescription>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setDraft({ ...emptyDraft })}>
            <Plus className="mr-2 h-4 w-4" /> Add destination
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Min severity</TableHead>
                <TableHead>Throttle</TableHead>
                <TableHead>Last delivery</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 8 : 7}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : hooks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 8 : 7} className="text-sm text-muted-foreground">
                    No delivery destinations configured — alerts are only emailed to administrators.
                  </TableCell>
                </TableRow>
              ) : (
                hooks.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.label}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{h.kind === "slack" ? "Slack" : "Generic JSON"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{h.url_preview}</TableCell>
                    <TableCell>
                      <Badge variant={h.min_severity === "critical" ? "destructive" : "outline"}>
                        {h.min_severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {h.throttle_minutes > 0 ? `${h.throttle_minutes} min` : "None"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDateTime(h.last_sent_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {!h.enabled ? (
                        <Badge variant="outline">Disabled</Badge>
                      ) : h.last_status?.startsWith("ok") ? (
                        <Badge variant="secondary">Delivered</Badge>
                      ) : h.last_status ? (
                        <span className="text-destructive" title={h.last_error ?? undefined}>
                          {h.last_status}
                        </span>
                      ) : (
                        <Badge variant="outline">Awaiting first alert</Badge>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="space-x-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDraft({
                              id: h.id,
                              label: h.label,
                              kind: h.kind,
                              url: "",
                              min_severity: h.min_severity,
                              throttle_minutes: h.throttle_minutes,
                              enabled: h.enabled,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Edit {h.label}</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(h)}>
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                          <span className="sr-only">Delete {h.label}</span>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit destination" : "Add destination"}</DialogTitle>
            <DialogDescription>
              Slack destinations receive formatted blocks; generic destinations receive a JSON payload. Throttling caps
              how often one destination is contacted.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="hook-label">Label</Label>
                <Input
                  id="hook-label"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="Security channel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hook-url">Webhook URL {draft.id && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}</Label>
                <Input
                  id="hook-url"
                  type="url"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://hooks.slack.com/services/…"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as Draft["kind"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slack">Slack</SelectItem>
                      <SelectItem value="generic">Generic JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Minimum severity</Label>
                  <Select
                    value={draft.min_severity}
                    onValueChange={(v) => setDraft({ ...draft, min_severity: v as Draft["min_severity"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medium">Medium and above</SelectItem>
                      <SelectItem value="high">High and above</SelectItem>
                      <SelectItem value="critical">Critical only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hook-throttle">Throttle (minutes)</Label>
                  <Input
                    id="hook-throttle"
                    type="number"
                    min={0}
                    value={String(draft.throttle_minutes)}
                    onChange={(e) =>
                      setDraft({ ...draft, throttle_minutes: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="hook-enabled"
                  checked={draft.enabled}
                  onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                />
                <Label htmlFor="hook-enabled">Enabled</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              onClick={() => draft && save.mutate(draft)}
              disabled={
                save.isPending ||
                !draft?.label.trim() ||
                (!draft?.id && !draft?.url.trim())
              }
            >
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save destination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove destination</DialogTitle>
            <DialogDescription>
              {deleteTarget?.label} will no longer receive security alerts. This action is audited.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
              disabled={remove.isPending}
            >
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
