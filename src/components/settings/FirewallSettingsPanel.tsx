import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck, ShieldAlert, RefreshCw, Plus, Trash2, Loader2,
  ListChecks, History, Inbox, Rss, Settings2, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type RuleKind =
  | "file_extension" | "file_mime" | "file_hash"
  | "url_domain" | "url_keyword" | "url_full"
  | "ip_address" | "ip_cidr" | "asn" | "waf_pattern";
type Action = "allow" | "warn" | "quarantine" | "block";

const KINDS: RuleKind[] = [
  "file_extension","file_mime","url_domain","url_keyword","ip_cidr","waf_pattern",
];
const ACTIONS: Action[] = ["allow","warn","quarantine","block"];

const ACTION_BADGE: Record<Action,string> = {
  allow:      "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  warn:       "bg-amber-500/15 text-amber-700 border-amber-500/30",
  quarantine: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  block:      "bg-destructive/15 text-destructive border-destructive/30",
};

export function FirewallSettingsPanel() {
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="overview" className="gap-1.5"><Settings2 className="h-4 w-4 text-primary" /> Overview</TabsTrigger>
        <TabsTrigger value="rules" className="gap-1.5"><ListChecks className="h-4 w-4 text-chart-1" /> Rules</TabsTrigger>
        <TabsTrigger value="feeds" className="gap-1.5"><Rss className="h-4 w-4 text-chart-2" /> Threat Feeds</TabsTrigger>
        <TabsTrigger value="quarantine" className="gap-1.5"><Inbox className="h-4 w-4 text-orange-600" /> Quarantine</TabsTrigger>
        <TabsTrigger value="events" className="gap-1.5"><History className="h-4 w-4 text-chart-4" /> Events</TabsTrigger>
      </TabsList>

      <TabsContent value="overview"><OverviewTab /></TabsContent>
      <TabsContent value="rules"><RulesTab /></TabsContent>
      <TabsContent value="feeds"><FeedsTab /></TabsContent>
      <TabsContent value="quarantine"><QuarantineTab /></TabsContent>
      <TabsContent value="events"><EventsTab /></TabsContent>
    </Tabs>
  );
}

/* ───────────────────────── Overview / Settings ───────────────────────── */

function OverviewTab() {
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery({
    queryKey: ["firewall-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("firewall_settings").select("*").limit(1).single();
      if (error) throw error;
      return data as any;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!s?.id) throw new Error("Settings row missing");
      const { error } = await supabase.from("firewall_settings").update(patch).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Firewall settings saved"); qc.invalidateQueries({ queryKey: ["firewall-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !s) return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Intrusion Prevention Firewall</CardTitle>
          <CardDescription>Master switch and global enforcement defaults. All risky uploads/links are scanned client-side and confirmed by the server before reaching storage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Firewall enabled</p>
              <p className="text-xs text-muted-foreground">When off, all checks return “allow”. Use only for emergencies.</p>
            </div>
            <Switch checked={s.is_enabled} onCheckedChange={(v) => save.mutate({ is_enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Daily threat-feed refresh</p>
              <p className="text-xs text-muted-foreground">Pulls URLhaus + OpenPhish lists at 03:30 UTC.</p>
            </div>
            <Switch checked={s.feed_refresh_enabled} onCheckedChange={(v) => save.mutate({ feed_refresh_enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Warn on external links</p>
              <p className="text-xs text-muted-foreground">SafeLink shows an interstitial for any non-portal URL.</p>
            </div>
            <Switch checked={s.link_warn_external} onCheckedChange={(v) => save.mutate({ link_warn_external: v })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max-mb">Max upload size (MB)</Label>
              <Input
                id="max-mb"
                type="number" min={1} max={200}
                defaultValue={s.max_upload_mb}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v && v !== s.max_upload_mb) save.mutate({ max_upload_mb: v });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Default action when matched</Label>
              <Select value={s.default_action} onValueChange={(v) => save.mutate({ default_action: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────────────────────── Rules CRUD ───────────────────────── */

function RulesTab() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<RuleKind>("file_extension");
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState<Action>("block");
  const [description, setDescription] = useState("");

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["firewall-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("firewall_rules")
        .select("*").order("kind").order("pattern");
      if (error) throw error;
      return data as any[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!pattern.trim()) throw new Error("Pattern required");
      const { error } = await supabase.from("firewall_rules").insert({
        kind, pattern: pattern.trim().toLowerCase(), action,
        description: description.trim() || null, is_enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule added"); setPattern(""); setDescription("");
      qc.invalidateQueries({ queryKey: ["firewall-rules"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase.from("firewall_rules").update({ is_enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["firewall-rules"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("firewall_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rule removed"); qc.invalidateQueries({ queryKey: ["firewall-rules"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Add rule</CardTitle>
          <CardDescription>New rules apply immediately. Patterns are matched case-insensitively.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3 space-y-1">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as RuleKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3 space-y-1">
            <Label>Pattern</Label>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. exe, malware.com" />
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as Action)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3 space-y-1">
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this rule exists" />
          </div>
          <div className="md:col-span-1">
            <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-chart-1" /> Active rules</CardTitle>
          <CardDescription>{rules.length} rule(s) configured.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Enabled</TableHead>
                    <TableHead className="text-right">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.kind}</TableCell>
                      <TableCell className="font-mono text-xs break-all">{r.pattern}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ACTION_BADGE[r.action as Action]}>{r.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px]">{r.description ?? "—"}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={r.is_enabled}
                          onCheckedChange={(v) => toggle.mutate({ id: r.id, is_enabled: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove.mutate(r.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rules.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No rules yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────────────────────── Threat feeds ───────────────────────── */

function FeedsTab() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: feeds = [], isLoading } = useQuery({
    queryKey: ["firewall-feeds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("firewall_threat_feeds").select("*").order("display_name");
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30_000,
  });

  const triggerRefresh = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("refresh-threat-feeds");
      if (error) throw error;
      toast.success("Threat feeds refreshed");
      qc.invalidateQueries({ queryKey: ["firewall-feeds"] });
    } catch (e: any) {
      toast.error(`Refresh failed: ${e.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Rss className="h-5 w-5 text-chart-2" /> Threat intelligence feeds</CardTitle>
          <CardDescription>Pulled daily into the firewall. Pull on-demand if you need the latest.</CardDescription>
        </div>
        <Button onClick={triggerRefresh} disabled={refreshing} className="gap-2">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? "Refreshing…" : "Refresh now"}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Last refreshed</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeds.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.display_name}</TableCell>
                    <TableCell className="font-mono text-xs break-all max-w-[300px]">{f.source_url}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {f.last_refreshed_at ? format(new Date(f.last_refreshed_at), "yyyy-MM-dd HH:mm") : "Never"}
                    </TableCell>
                    <TableCell>{f.last_entry_count ?? 0}</TableCell>
                    <TableCell>
                      {f.last_status === "ok"
                        ? <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" /> ok</Badge>
                        : f.last_status
                          ? <Badge variant="outline" className="text-destructive border-destructive/40 text-xs"><XCircle className="h-3 w-3 mr-1" /> {String(f.last_status).slice(0, 40)}</Badge>
                          : <Badge variant="outline">—</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={f.is_enabled}
                        onCheckedChange={async (v) => {
                          await supabase.from("firewall_threat_feeds").update({ is_enabled: v }).eq("id", f.id);
                          qc.invalidateQueries({ queryKey: ["firewall-feeds"] });
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────────────────── Quarantine queue ───────────────────────── */

function QuarantineTab() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<{ id: string; subject: string; mode: "release" | "block" } | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["firewall-quarantine"],
    queryFn: async () => {
      const { data, error } = await supabase.from("firewall_quarantine")
        .select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 15_000,
  });

  const submit = async () => {
    if (!target) return;
    if (reason.trim().length < 5) { toast.error("Reason must be at least 5 characters."); return; }
    setSubmitting(true);
    try {
      const fn = target.mode === "release" ? "firewall_release_quarantine" : "firewall_block_quarantine";
      const { error } = await supabase.rpc(fn, { _id: target.id, _reason: reason.trim() });
      if (error) throw error;
      toast.success(target.mode === "release" ? "Item released" : "Item permanently blocked");
      setTarget(null); setReason("");
      qc.invalidateQueries({ queryKey: ["firewall-quarantine"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5 text-orange-600" /> Quarantine queue</CardTitle>
          <CardDescription>{items.length} item(s) awaiting review. Releasing or blocking requires a reason and is audited.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Queue is empty. ✅</div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Layer</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Reported by</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(it.created_at), "yyyy-MM-dd HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline">{it.layer}</Badge></TableCell>
                      <TableCell className="font-mono text-xs break-all max-w-[260px]">{it.subject}</TableCell>
                      <TableCell className="text-xs max-w-[260px]">{it.reason}</TableCell>
                      <TableCell className="text-xs">{it.reported_label ?? "—"}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setTarget({ id: it.id, subject: it.subject, mode: "release" }); setReason(""); }}>
                          Release
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { setTarget({ id: it.id, subject: it.subject, mode: "block" }); setReason(""); }}>
                          Block
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o && !submitting) setTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.mode === "release" ? "Release item" : "Block item permanently"}</DialogTitle>
            <DialogDescription>
              <span className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs my-2">{target?.subject}</span>
              Reason is required (≥5 chars) and recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3} maxLength={500}
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reviewed and verified safe / Confirmed malicious; …"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || reason.trim().length < 5} variant={target?.mode === "block" ? "destructive" : "default"}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (target?.mode === "release" ? "Release" : "Block")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────────────────── Events log ───────────────────────── */

function EventsTab() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["firewall-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("firewall_events")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 15_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-chart-4" /> Recent firewall events</CardTitle>
        <CardDescription>Most recent 200 events across all layers.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No events recorded yet.</div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Layer</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(ev.created_at), "MM-dd HH:mm:ss")}</TableCell>
                    <TableCell><Badge variant="outline">{ev.layer}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={ACTION_BADGE[ev.action as Action]}>{ev.action}</Badge></TableCell>
                    <TableCell className="font-mono text-xs break-all max-w-[320px]">{ev.subject}</TableCell>
                    <TableCell className="text-xs">{ev.user_label ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
