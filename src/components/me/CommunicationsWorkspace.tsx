import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePagedList } from "@/hooks/usePagedList";
import { uploadSecureFile } from "@/lib/secure-upload";
import { formatDateTime } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ListPagination } from "@/components/ui/list-pagination";
import { FileUploadGuard } from "@/components/security/FileUploadGuard";
import { toast } from "sonner";
import { Download, Inbox, Loader2, MailCheck, MessagesSquare, Paperclip, Search, Send, ShieldCheck, X } from "lucide-react";

const db = supabase as any;
type Att = { path: string; name: string; size: number; mime: string; sha: string; scan: string };
type Msg = { id: string; sender_id: string; audience_type: string; subject: string; body: string; priority: string; recipient_count: number; created_at: string; parent_id: string | null };

const SENDER_ROLES = ["admin", "oic", "2ic", "head_of_administration", "chief_staff_officer", "command_officer", "me_officer", "project_manager", "staff_officer"];
const priorityVariant = (p: string) => (p === "urgent" ? "destructive" : p === "important" ? "default" : "secondary") as any;

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof Inbox; tone: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className={`rounded-md p-2 ${tone}`}><Icon className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div></CardContent></Card>;
}

async function downloadAttachment(a: { storage_path: string; message_id: string; filename: string }, uid?: string) {
  const { data, error } = await supabase.storage.from("secure-uploads").createSignedUrl(a.storage_path, 60);
  if (error || !data) { toast.error("You are not authorised to download this file"); return; }
  await db.from("me_message_audit").insert({ actor_id: uid, action: "attachment_download", message_id: a.message_id, details: { file: a.filename } });
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function useNames(ids: string[]) {
  return useQuery({
    queryKey: ["me-comm-names", [...new Set(ids)].sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await db.from("profiles").select("user_id, first_name, last_name").in("user_id", [...new Set(ids)]);
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.user_id] = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      return map;
    },
  });
}

function MessageDialog({ message, onClose, mode }: { message: Msg | null; onClose: () => void; mode: "inbox" | "sent" }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const rootId = message?.parent_id ?? message?.id;
  const thread = useQuery({
    queryKey: ["me-comm-thread", rootId],
    enabled: !!rootId,
    queryFn: async () => {
      const { data } = await db.from("me_messages").select("*").or(`id.eq.${rootId},parent_id.eq.${rootId}`).order("created_at");
      const ids = (data ?? []).map((m: Msg) => m.id);
      const { data: atts } = await db.from("me_message_attachments").select("*").in("message_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      return { messages: (data ?? []) as Msg[], atts: atts ?? [] };
    },
  });
  const recipients = useQuery({
    queryKey: ["me-comm-recipients", message?.id],
    enabled: !!message && mode === "sent",
    queryFn: async () => (await db.from("me_message_recipients").select("*").eq("message_id", message!.id)).data ?? [],
  });
  const names = useNames([...(thread.data?.messages.map((m) => m.sender_id) ?? []), ...(recipients.data?.map((r: any) => r.recipient_user_id) ?? [])]);

  useEffect(() => {
    if (message && mode === "inbox") void db.rpc("me_mark_read", { _message: message.id }).then(() => qc.invalidateQueries({ queryKey: ["me-comm"] }));
  }, [message, mode, qc]);

  const sendReply = async () => {
    if (!message || !reply.trim()) return;
    setSending(true);
    const { error } = await db.rpc("me_send_message", { _audience: "reply", _target: null, _subject: `Re: ${message.subject}`.slice(0, 200), _body: reply.trim(), _priority: "normal", _attachments: [], _parent: message.id });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setReply(""); toast.success("Reply sent");
    void thread.refetch(); qc.invalidateQueries({ queryKey: ["me-comm"] });
  };

  return (
    <Dialog open={!!message} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{message?.subject}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {(thread.data?.messages ?? []).map((m) => (
            <div key={m.id} className="rounded-md border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{names.data?.[m.sender_id] || "Officer"}</span>
                <span>{formatDateTime(m.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              {(thread.data?.atts ?? []).filter((a: any) => a.message_id === m.id).map((a: any) => (
                <Button key={a.id} variant="outline" size="sm" className="mt-2 mr-2" onClick={() => void downloadAttachment(a, user?.id)}>
                  <Download className="mr-1 h-3.5 w-3.5" />{a.filename}
                </Button>
              ))}
            </div>
          ))}
          {mode === "sent" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Delivery status ({recipients.data?.length ?? 0})</h3>
              <div className="max-h-56 overflow-auto rounded-md border">
                <table className="w-full text-sm"><thead className="bg-muted/40 text-left"><tr><th className="px-3 py-2">Recipient</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Delivered</th><th className="px-3 py-2">Read</th></tr></thead>
                  <tbody>{(recipients.data ?? []).map((r: any) => <tr key={r.id} className="border-t"><td className="px-3 py-2">{names.data?.[r.recipient_user_id] || "Officer"}</td><td className="px-3 py-2"><Badge variant={r.read_at ? "default" : "secondary"}>{r.read_at ? "Read" : r.delivered_at ? "Delivered" : "Queued"}</Badge></td><td className="px-3 py-2">{formatDateTime(r.delivered_at)}</td><td className="px-3 py-2">{formatDateTime(r.read_at)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="me-reply">Reply</Label>
            <Textarea id="me-reply" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={10000} rows={3} />
            <Button onClick={() => void sendReply()} disabled={sending || !reply.trim()}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send reply</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Compose({ onSent }: { onSent: () => void }) {
  const { user } = useAuth();
  const [audience, setAudience] = useState<"individual" | "department" | "command">("individual");
  const [target, setTarget] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [atts, setAtts] = useState<Att[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const options = useQuery({
    queryKey: ["me-comm-options", audience],
    queryFn: async () => {
      if (audience === "individual") {
        const { data } = await db.from("profiles").select("id, first_name, last_name, staff_id").is("deleted_at", null).not("user_id", "is", null).order("first_name").limit(2000);
        return (data ?? []).map((p: any) => ({ value: p.id, label: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.staff_id, search: p.staff_id ?? "" }));
      }
      if (audience === "department") {
        const { data } = await db.from("departments").select("id, name").order("name");
        return (data ?? []).map((d: any) => ({ value: d.id, label: d.name }));
      }
      const { data } = await db.from("org_units").select("id, name, unit_type").order("name");
      return (data ?? []).map((u: any) => ({ value: u.id, label: u.name, search: u.unit_type }));
    },
  });

  const handleFiles = async (files: File[]) => {
    if (atts.length + files.length > 5) { toast.error("At most 5 attachments"); return; }
    setUploading(true);
    for (const f of files) {
      try {
        const r = await uploadSecureFile(f, { maxMb: 10 });
        setAtts((a) => [...a, { path: r.path, name: f.name, size: f.size, mime: f.type, sha: r.sha, scan: r.verdict }]);
        await db.from("me_message_audit").insert({ actor_id: user?.id, action: "attachment_uploaded", details: { file: f.name, verdict: r.verdict } });
      } catch (e: any) {
        toast.error(`${f.name}: ${e.message ?? "upload failed"}`);
        await db.from("me_message_audit").insert({ actor_id: user?.id, action: "attachment_blocked", details: { file: f.name, reason: String(e.message ?? "") } });
      }
    }
    setUploading(false);
  };

  const send = async () => {
    if (!target || !subject.trim() || !body.trim()) { toast.error("Choose a recipient and fill in subject and message"); return; }
    setSending(true);
    const { error } = await db.rpc("me_send_message", { _audience: audience, _target: target, _subject: subject.trim(), _body: body.trim(), _priority: priority, _attachments: atts, _parent: null });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Message sent");
    setSubject(""); setBody(""); setAtts([]); setTarget("");
    onSent();
  };

  return (
    <Card><CardHeader><CardTitle className="text-base">Compose message</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label>Send to</Label>
          <Select value={audience} onValueChange={(v: any) => { setAudience(v); setTarget(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="individual">Individual staff member</SelectItem><SelectItem value="department">Department</SelectItem><SelectItem value="command">Command (incl. sub-units)</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Recipient</Label>
          <SearchableSelect options={options.data ?? []} value={target} onValueChange={setTarget} placeholder={options.isLoading ? "Loading…" : "Select…"} />
        </div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="me-subject">Subject</Label><Input id="me-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="me-body">Message</Label><Textarea id="me-body" rows={6} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="space-y-2"><Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="important">Important</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label className="flex items-center gap-1"><Paperclip className="h-4 w-4" />Attachments (max 5 × 10 MB, virus-scanned)</Label>
          {uploading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Scanning & uploading…</p>
            : <FileUploadGuard onAccept={handleFiles} accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xlsx,.csv" buttonLabel="Attach files" disabled={atts.length >= 5} />}
          {atts.map((a) => <div key={a.path} className="flex items-center justify-between rounded border px-2 py-1 text-sm"><span className="truncate">{a.name}</span><span className="flex items-center gap-1"><Badge variant="secondary">{a.scan}</Badge><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Remove ${a.name}`} onClick={() => setAtts((x) => x.filter((y) => y.path !== a.path))}><X className="h-3.5 w-3.5" /></Button></span></div>)}
        </div>
        <div className="md:col-span-2"><Button onClick={() => void send()} disabled={sending || uploading}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send securely</Button></div>
      </CardContent>
    </Card>
  );
}

function MessageList({ rows, mode, onOpen, unread }: { rows: Msg[]; mode: "inbox" | "sent"; onOpen: (m: Msg) => void; unread?: Set<string> }) {
  const [search, setSearch] = useState("");
  const [prio, setPrio] = useState("all");
  const filtered = useMemo(() => rows.filter((m) => (prio === "all" || m.priority === prio) && `${m.subject} ${m.body}`.toLowerCase().includes(search.toLowerCase())), [rows, search, prio]);
  const paged = usePagedList(filtered, { resetKey: `${search}|${prio}` });
  return (
    <Card><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search messages…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={prio} onValueChange={setPrio}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All priorities</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="important">Important</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm">
        <thead className="border-b bg-muted/40 text-left"><tr><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Audience</th><th className="px-3 py-2">Priority</th>{mode === "sent" && <th className="px-3 py-2">Recipients</th>}<th className="px-3 py-2">Sent</th></tr></thead>
        <tbody>{paged.pageItems.length === 0 ? <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">No messages.</td></tr> : paged.pageItems.map((m) => (
          <tr key={m.id} className={`cursor-pointer border-b hover:bg-muted/30 ${unread?.has(m.id) ? "bg-primary/5 font-semibold" : ""}`} onClick={() => onOpen(m)}>
            <td className="max-w-[320px] truncate px-3 py-2">{unread?.has(m.id) && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}{m.subject}</td>
            <td className="px-3 py-2 capitalize">{m.audience_type}</td>
            <td className="px-3 py-2"><Badge variant={priorityVariant(m.priority)} className="capitalize">{m.priority}</Badge></td>
            {mode === "sent" && <td className="px-3 py-2">{m.recipient_count}</td>}
            <td className="whitespace-nowrap px-3 py-2">{formatDateTime(m.created_at)}</td>
          </tr>))}</tbody>
      </table></div>
      <ListPagination {...paged} label="messages" />
    </CardContent></Card>
  );
}

export function CommunicationsWorkspace() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState<{ m: Msg; mode: "inbox" | "sent" } | null>(null);
  const canCompose = useQuery({ queryKey: ["me-comm", "can-send", user?.id], enabled: !!user && SENDER_ROLES.includes(role ?? ""), queryFn: async () => (await db.rpc("me_comm_can_send", { _uid: user!.id })).data === true });

  const stats = useQuery({ queryKey: ["me-comm", "stats"], enabled: !!user, queryFn: async () => (await db.rpc("me_message_stats")).data ?? {} });
  const inbox = useQuery({
    queryKey: ["me-comm", "inbox", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await db.from("me_message_recipients").select("read_at, me_messages(*)").eq("recipient_user_id", user!.id).order("created_at", { ascending: false }).limit(500);
      return (data ?? []).filter((r: any) => r.me_messages).map((r: any) => ({ ...r.me_messages, _read: !!r.read_at }));
    },
  });
  const sent = useQuery({
    queryKey: ["me-comm", "sent", user?.id], enabled: !!user,
    queryFn: async () => (await db.from("me_messages").select("*").eq("sender_id", user!.id).order("created_at", { ascending: false }).limit(500)).data ?? [],
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`me-comm-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "me_message_recipients" }, () => qc.invalidateQueries({ queryKey: ["me-comm"] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "me_messages" }, () => qc.invalidateQueries({ queryKey: ["me-comm"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const s: any = stats.data ?? {};
  const readRate = s.delivered ? Math.round((s.read / s.delivered) * 100) : 0;
  const by = s.by_audience ?? {};
  const maxBy = Math.max(1, ...Object.values(by).map(Number));
  const unread = new Set<string>((inbox.data ?? []).filter((m: any) => !m._read).map((m: any) => m.id));
  const refresh = () => qc.invalidateQueries({ queryKey: ["me-comm"] });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3"><div className="rounded-md bg-primary/10 p-2 text-primary"><MessagesSquare className="h-5 w-5" /></div>
        <div><p className="text-sm font-medium text-primary">M&E and Project Management</p><h1 className="text-2xl font-bold tracking-tight">Communications</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Secure messaging to staff, departments and commands with scanned attachments, delivery tracking and audit.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Sent today / 7 days" value={`${s.sent_today ?? 0} / ${s.sent_7d ?? 0}`} icon={Send} tone="bg-primary/10 text-primary" />
        <Stat label="Read rate" value={`${readRate}%`} icon={MailCheck} tone="bg-accent text-accent-foreground" />
        <Stat label="Unread in my inbox" value={s.unread_inbox ?? 0} icon={Inbox} tone={(s.unread_inbox ?? 0) > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"} />
        <Stat label="Attachments / blocked" value={`${s.attachments ?? 0} / ${s.blocked ?? 0}`} icon={ShieldCheck} tone={(s.blocked ?? 0) > 0 ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"} />
        <Card><CardContent className="space-y-1.5 p-4"><p className="text-xs text-muted-foreground">By audience</p>
          {["individual", "department", "command", "reply"].map((k) => <div key={k} className="flex items-center gap-2 text-xs"><span className="w-16 capitalize">{k}</span><div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(Number(by[k] ?? 0) / maxBy) * 100}%` }} /></div><span className="w-6 text-right">{by[k] ?? 0}</span></div>)}
        </CardContent></Card>
      </div>
      <Tabs defaultValue="inbox">
        <TabsList className="flex-wrap"><TabsTrigger value="inbox">Inbox {unread.size > 0 && <Badge className="ml-2">{unread.size}</Badge>}</TabsTrigger>{canCompose.data && <TabsTrigger value="compose">Compose</TabsTrigger>}<TabsTrigger value="sent">Sent & tracking</TabsTrigger></TabsList>
        <TabsContent value="inbox"><MessageList rows={inbox.data ?? []} mode="inbox" unread={unread} onOpen={(m) => setOpen({ m, mode: "inbox" })} /></TabsContent>
        {canCompose.data && <TabsContent value="compose"><Compose onSent={refresh} /></TabsContent>}
        <TabsContent value="sent"><MessageList rows={sent.data ?? []} mode="sent" onOpen={(m) => setOpen({ m, mode: "sent" })} /></TabsContent>
      </Tabs>
      <MessageDialog message={open?.m ?? null} mode={open?.mode ?? "inbox"} onClose={() => { setOpen(null); refresh(); }} />
    </div>
  );
}
