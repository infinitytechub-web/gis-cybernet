import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Crosshair, Plus, RefreshCw, Download, Pencil, Eye, FolderLock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRbac } from "@/hooks/useRbac";
import { useStaffIdDisplay } from "@/hooks/useStaffIdDisplay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateInput } from "@/components/ui/date-input";
import { PagedSection } from "@/components/ui/paged-section";
import { QuickScroll } from "@/components/ui/quick-scroll";
import { buildCsv } from "@/lib/csv-safe";
import { downloadCSVString } from "@/lib/download-utils";
import { ARMORY_KINDS, ARMORY_LABELS, ARMORY_FIELDS, armoryActions, armoryEditable, armoryTotals, armoryAlerts, armoryFormSchema, armoryReportRows, armoryAwaitingApproval, armoryStatusLabel, type ArmoryKind, type ArmoryRecord, type ArmoryContext } from "@/lib/armory";
import type { Json } from "@/integrations/supabase/types";

type EventRow = { id: string; record_id: string; org_unit_id: string; actor_name: string; action: string; reason: string; created_at: string };
const emptyForm = () => ({ reference:"",title:"",profile_id:"",asset_id:"",parent_id:"",destination_unit_id:"",details:{} as Record<string,string>,reason:"" });
const statusLabel = (s:string) => s.replace(/_/g," ");
const dateLabel = (s:string) => { const date = new Date(s); return Number.isNaN(date.getTime()) ? s : format(date, s.length>10 ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy"); };

export default function ArmoryWeapons() {
  const { user } = useAuth();
  const { can: canAccess } = useRbac();
  const { formatStaffId } = useStaffIdDisplay("directory");
  const qc = useQueryClient();
  const [tab,setTab] = useState("dashboard");
  const [unit,setUnit] = useState("");
  const [search,setSearch] = useState("");
  const [status,setStatus] = useState("all");
  const [reportKind,setReportKind] = useState("all");
  const [dateFrom,setDateFrom] = useState("");
  const [dateTo,setDateTo] = useState("");
  const [dialog,setDialog] = useState(false);
  const [editing,setEditing] = useState<ArmoryRecord | null>(null);
  const [form,setForm] = useState(emptyForm);
  const [detail,setDetail] = useState<ArmoryRecord | null>(null);
  const [decision,setDecision] = useState<{record:ArmoryRecord;action:string}|null>(null);
  const [reason,setReason] = useState("");
  const [quantity,setQuantity] = useState("");
  useEffect(() => {
    if (!user) return;
    const update = () => { void qc.invalidateQueries({queryKey:["armory-records"]}); void qc.invalidateQueries({queryKey:["armory-events"]}); void qc.invalidateQueries({queryKey:["armory-context"]}); };
    const channel = supabase.channel(`armory-${user.id}-${crypto.randomUUID()}`).on("postgres_changes",{event:"*",schema:"public",table:"armory_records"},update).on("postgres_changes",{event:"INSERT",schema:"public",table:"armory_events"},update).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc,user]);
  const contextQuery = useQuery({queryKey:["armory-context",user?.id],enabled:!!user,refetchInterval:60000,queryFn:async()=>{
    const {data,error} = await supabase.rpc("armory_context"); if(error) throw error;
    return data as unknown as ArmoryContext;
  }});
  const context = contextQuery.data ?? {commands:[],staff:[]};
  const selectedUnit = unit || context.commands[0]?.id || "";
  const command = context.commands.find(c=>c.id===selectedUnit);
  const recordsQuery = useQuery({queryKey:["armory-records",user?.id],enabled:!!user && !!context.commands.length,refetchInterval:30000,queryFn:async()=>{
    const all:ArmoryRecord[]=[];
    for(let offset=0;;offset+=500){const {data,error}=await supabase.from("armory_records").select("*").order("created_at",{ascending:false}).order("id").range(offset,offset+499); if(error) throw error; all.push(...data as unknown as ArmoryRecord[]); if(data.length<500) break;}
    return all;
  }});
  const eventsQuery = useQuery({queryKey:["armory-events",user?.id],enabled:!!user && !!context.commands.length,refetchInterval:30000,queryFn:async()=>{
    const all:EventRow[]=[]; for(let offset=0;;offset+=500){const {data,error}=await supabase.from("armory_events").select("id,record_id,org_unit_id,actor_name,action,reason,created_at").order("created_at",{ascending:false}).order("id").range(offset,offset+499);if(error)throw error;all.push(...data);if(data.length<500)break;}return all;
  }});
  const allRecords = recordsQuery.data ?? [];
  const records = allRecords.filter(r=>r.org_unit_id===selectedUnit || (r.kind==="transfer" && r.destination_unit_id===selectedUnit));
  const staffName = (id:string|null, exportMode=false) => {const p=context.staff.find(s=>s.id===id); return p ? `${p.first_name} ${p.last_name} · ${formatStaffId(p.staff_id,{ownerUserId:p.user_id,context:exportMode ? "export":"directory"})}` : "—";};
  const reportRecords = tab === "reports" ? armoryReportRows(records,reportKind,format(new Date(),"yyyy-MM-dd")) : records;
  const filtered = reportRecords.filter(r=>(tab==="reports" || r.kind===tab) && (status==="all" || r.status===status) && (!dateFrom || r.created_at.slice(0,10)>=dateFrom) && (!dateTo || r.created_at.slice(0,10)<=dateTo) && `${r.reference} ${r.title} ${staffName(r.profile_id)} ${r.status} ${Object.values(r.details).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const totals = armoryTotals(records);
  const alerts = armoryAlerts(records,format(new Date(),"yyyy-MM-dd"));
  const events = (eventsQuery.data ?? []).filter(e=>(e.org_unit_id===selectedUnit || records.some(r=>r.id===e.record_id)) && (!dateFrom || e.created_at.slice(0,10)>=dateFrom) && (!dateTo || e.created_at.slice(0,10)<=dateTo) && `${e.actor_name} ${e.action} ${e.reason}`.toLowerCase().includes(search.toLowerCase()));
  const refresh = async()=>{await Promise.all([qc.invalidateQueries({queryKey:["armory-records"]}),qc.invalidateQueries({queryKey:["armory-events"]}),qc.invalidateQueries({queryKey:["armory-context"]})]);};
  const save = useMutation({mutationFn:async()=>{
    if(!ARMORY_KINDS.includes(tab as ArmoryKind))throw new Error("Select a register");
    armoryFormSchema.parse(form);
    if(["custody","transfer","maintenance"].includes(tab)&&!form.asset_id)throw new Error("Select a registered weapon");
    for(const field of ARMORY_FIELDS[tab as ArmoryKind]){if(field.required && !form.details[field.key]?.trim())throw new Error(`${field.label} is required`);}
    const {data,error}=await supabase.rpc("armory_save",{_id:editing?.id ?? null,_kind:tab,_unit:selectedUnit,_reference:form.reference,_title:form.title,_profile:form.profile_id||null,_asset:form.asset_id||null,_parent:form.parent_id||null,_destination:form.destination_unit_id||null,_details:form.details as Json,_reason:form.reason,_version:editing?.version??null});
    if(error)throw error;return data;
  },onSuccess:async()=>{setDialog(false);await refresh();toast.success("Armory record saved");},onError:(e)=>toast.error(e.message)});
  const transition = useMutation({mutationFn:async()=>{if(!decision)throw new Error("Select a record");if(decision.action==="adjust"){ const value=Number(quantity); if(!/^\d+$/.test(quantity)||!Number.isSafeInteger(value)||value>100000000)throw new Error("Enter a valid whole-number quantity"); const {error}=await supabase.rpc("armory_adjust_ammunition",{_id:decision.record.id,_quantity:value,_reason:reason,_version:decision.record.version});if(error)throw error;return;}const {error}=await supabase.rpc("armory_transition",{_id:decision.record.id,_action:decision.action,_reason:reason,_version:decision.record.version});if(error)throw error;},onSuccess:async()=>{setDecision(null);setReason("");await refresh();toast.success("Workflow updated");},onError:e=>toast.error(e.message)});
  const exportRows = async(activity=false)=>{try{
    const {error}=await supabase.rpc("armory_export_log",{_unit:selectedUnit,_kind:activity?"activity":tab,_count:activity?events.length:filtered.length});if(error)throw error;
    const csv = activity ? buildCsv(["Date / time","Actor","Action","Reason","Record"],events.map(e=>[dateLabel(e.created_at),e.actor_name,e.action,e.reason,allRecords.find(r=>r.id===e.record_id)?.reference??e.record_id])) : buildCsv(["Reference","Register","Title","Officer","Command","Status","Recorded","Details"],filtered.map(r=>[r.reference,ARMORY_LABELS[r.kind],r.title,staffName(r.profile_id,true),context.commands.find(c=>c.id===r.org_unit_id)?.name??"",statusLabel(r.status),dateLabel(r.created_at),JSON.stringify(r.details)]));
    downloadCSVString(csv,`armory-${activity?"activity":tab}-${format(new Date(),"yyyy-MM-dd")}.csv`);
  }catch(e){toast.error(e instanceof Error?e.message:"Export failed");}};
  const openCreate=()=>{setEditing(null);setForm(emptyForm());setDialog(true);};
  const openEdit=(r:ArmoryRecord)=>{setEditing(r);setForm({reference:r.reference,title:r.title,profile_id:r.profile_id??"",asset_id:r.asset_id??"",parent_id:r.parent_id??"",destination_unit_id:r.destination_unit_id??"",details:r.details,reason:""});setDialog(true);};
  const register = ARMORY_KINDS.includes(tab as ArmoryKind);
  const error = contextQuery.error ?? recordsQuery.error ?? eventsQuery.error;
  const loading = contextQuery.isLoading || recordsQuery.isLoading;
  const statuses = useMemo(()=>[...new Set(records.map(r=>r.status))].sort(),[records]);
  const field = (key:string,value:string)=>setForm(f=>({...f,details:{...f.details,[key]:value}}));
  const actionsFor = (r:ArmoryRecord)=>{
    const origin=context.commands.find(c=>c.id===r.org_unit_id);
    const actions=armoryActions(r,!!origin?.can_approve,user?.id??"",context.staff.find(s=>s.id===r.profile_id)?.user_id);
    if(r.kind==="transfer" && r.status==="handed_over" && context.commands.find(c=>c.id===r.destination_unit_id)?.can_approve)actions.push("receive");
    if(r.kind === "ammunition" && r.status === "verified" && origin?.can_manage) actions.push("adjust");
    return origin?.can_manage ? actions : actions.filter(a=>a==="acknowledge"||a==="receive");
  };
  const renderList = (items:ArmoryRecord[]) => <PagedSection items={items} label="records">{rows=><Table><TableHeader><TableRow><TableHead>Reference / record</TableHead><TableHead>Officer / asset</TableHead><TableHead>Status</TableHead><TableHead>Recorded</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id}><TableCell><div className="font-medium">{r.reference}</div><div>{r.title}</div><div className="text-xs text-muted-foreground">{ARMORY_LABELS[r.kind]}</div></TableCell><TableCell>{r.profile_id?staffName(r.profile_id):allRecords.find(a=>a.id===r.asset_id)?.reference??"—"}</TableCell><TableCell><Badge variant={armoryAwaitingApproval(r)?"secondary":"outline"} className="capitalize">{armoryStatusLabel(r)}</Badge></TableCell><TableCell className="whitespace-nowrap">{dateLabel(r.created_at)}</TableCell><TableCell><div className="flex flex-wrap gap-1"><Button size="icon" variant="ghost" aria-label={`View ${r.reference}`} onClick={()=>setDetail(r)}><Eye className="h-4 w-4"/></Button>{register && command?.can_manage && armoryEditable(r) && r.org_unit_id===selectedUnit && <Button size="icon" variant="ghost" aria-label={`Edit ${r.reference}`} onClick={()=>openEdit(r)}><Pencil className="h-4 w-4"/></Button>}{actionsFor(r).map(action=><Button key={action} size="sm" variant="outline" className="capitalize" onClick={()=>{setDecision({record:r,action});setReason("");setQuantity("");}}>{statusLabel(action)}</Button>)}</div></TableCell></TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No records match these filters.</TableCell></TableRow>}</TableBody></Table>}</PagedSection>;

  return <div className="space-y-5 min-w-0">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold flex items-center gap-2"><Crosshair className="h-6 w-6 text-primary"/>Armory & Weapons</h1><p className="text-muted-foreground">{command?.name??"Command workspace"}</p></div><Button variant="outline" onClick={()=>void refresh()} disabled={loading}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button></header>
    {error && <div role="alert" className="border border-destructive rounded-md p-4">{error.message}<Button variant="outline" onClick={()=>void refresh()} className="ml-2">Retry</Button></div>}
    {loading ? <p role="status">Loading armory records…</p> : !context.commands.length ? <p role="status">No authorized armory commands. A Super Admin can grant Armory & Weapons access.</p> : <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><Label>Command</Label><SearchableSelect value={selectedUnit} onValueChange={setUnit} options={context.commands.map(c=>({value:c.id,label:c.name}))}/></div><div><Label htmlFor="armory-search">Search</Label><Input id="armory-search" placeholder="Reference, officer or record" value={search} onChange={e=>setSearch(e.target.value)}/></div><div><Label>From</Label><DateInput aria-label="From date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div><div><Label>To</Label><DateInput aria-label="To date" value={dateTo} min={dateFrom} onChange={e=>setDateTo(e.target.value)}/></div></div>
    <Tabs value={tab} onValueChange={v=>{setTab(v);setStatus("all");}}><div className="overflow-x-auto"><TabsList className="h-auto w-max justify-start">{["dashboard",...ARMORY_KINDS,"documents","alerts","reports","activity","configuration"].map(t=><TabsTrigger key={t} value={t}>{ARMORY_LABELS[t as ArmoryKind]??({dashboard:"Dashboard",documents:"Documents",alerts:"Notifications & Approvals",reports:"Reports & BI",activity:"Security & Activity",configuration:"Configuration"}[t])}</TabsTrigger>)}</TabsList></div></Tabs>
    <div className="flex flex-wrap gap-2"><Button size="sm" asChild><Link to="/armory-weapons/approvals">Approvals queue</Link></Button></div>
    {tab==="reports"&&<Button variant="outline" size="sm" asChild><Link to="/armory-weapons/report">Monthly command report</Link></Button>}
    {tab==="reports"&&<div className="max-w-sm"><Label>Report</Label><SearchableSelect value={reportKind} onValueChange={setReportKind} options={[{value:"all",label:"Complete command register"},{value:"pending",label:"Pending approvals"},{value:"exceptions",label:"Compliance exceptions"},...ARMORY_KINDS.map(k=>({value:k,label:ARMORY_LABELS[k]}))]}/></div>}
    {tab==="dashboard" ? <><div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{[["Weapons",totals.weapons],["In store",totals.inStore],["Issued",totals.issued],["Verified ammunition",totals.ammunition],["Pending approval",totals.pending],["Open findings",totals.openFindings]].map(([label,value])=><Card key={label}><CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent><strong className="text-3xl text-primary">{value}</strong></CardContent></Card>)}</div><h2 className="text-lg font-semibold">Command establishment</h2><Table><TableHeader><TableRow><TableHead>Command</TableHead><TableHead>Weapons</TableHead><TableHead>Issued</TableHead><TableHead>Pending</TableHead></TableRow></TableHeader><TableBody>{context.commands.map(c=>{const t=armoryTotals(allRecords.filter(r=>r.org_unit_id===c.id));return <TableRow key={c.id}><TableCell><Button variant="link" onClick={()=>setUnit(c.id)}>{c.name}</Button></TableCell><TableCell>{t.weapons}</TableCell><TableCell>{t.issued}</TableCell><TableCell>{t.pending}</TableCell></TableRow>;})}</TableBody></Table><h2 className="text-lg font-semibold">Pending and compliance exceptions</h2>{renderList(alerts)}</> : tab==="documents" ? <div className="space-y-3"><h2 className="text-lg font-semibold">Armory documents</h2>{canAccess("command-vault")?<Button asChild variant="outline"><Link to={`/command-vault?command=${selectedUnit}&category=armory`}><FolderLock className="h-4 w-4 mr-2"/>Open Command Vault</Link></Button>:<p>Command Vault permission is required for armory documents.</p>}</div> : tab==="configuration" ? <div className="space-y-4"><h2 className="text-lg font-semibold">Security & command configuration</h2><div className="flex flex-wrap gap-3">{canAccess("settings")&&<Button asChild variant="outline"><Link to="/settings?area=security"><ShieldCheck className="h-4 w-4 mr-2"/>System security</Link></Button>}{canAccess("org-structure")&&<Button asChild variant="outline"><Link to="/org-structure">Command administration</Link></Button>}{canAccess("settings")&&<Button asChild variant="outline"><Link to="/settings?area=security&tab=custom-roles">User Roles</Link></Button>}</div></div> : tab==="activity" ? <><div className="flex justify-between gap-2"><h2 className="text-lg font-semibold">Immutable activity</h2><Button variant="outline" onClick={()=>void exportRows(true)}><Download className="h-4 w-4 mr-2"/>CSV</Button></div><PagedSection items={events} label="events">{rows=><Table><TableHeader><TableRow><TableHead>Date / time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader><TableBody>{rows.map(e=><TableRow key={e.id}><TableCell className="whitespace-nowrap">{dateLabel(e.created_at)}</TableCell><TableCell>{e.actor_name}</TableCell><TableCell>{statusLabel(e.action)}</TableCell><TableCell>{allRecords.find(r=>r.id===e.record_id)?.reference??"—"}</TableCell><TableCell>{e.reason}</TableCell></TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={5}>No activity recorded.</TableCell></TableRow>}</TableBody></Table>}</PagedSection></> : <><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{ARMORY_LABELS[tab as ArmoryKind]??(tab==="alerts"?"Notifications & Approvals":"Reports & BI")}</h2><div className="flex flex-wrap gap-2"><SearchableSelect value={status} onValueChange={setStatus} options={[{value:"all",label:"All statuses"},...statuses.map(s=>({value:s,label:statusLabel(s)}))]}/>{register&&command?.can_manage&&command.active&&<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2"/>Add record</Button>}<Button variant="outline" onClick={()=>void exportRows()} disabled={tab==="alerts"}><Download className="h-4 w-4 mr-2"/>CSV</Button></div></div>{renderList(tab==="alerts"?alerts:filtered)}</>}
    <QuickScroll position="inline" followActive label="armory workspace"/>
    </>}
    <Dialog open={dialog} onOpenChange={setDialog}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing?"Edit":"Add"} {ARMORY_LABELS[tab as ArmoryKind]}</DialogTitle></DialogHeader><form onSubmit={e=>{e.preventDefault();save.mutate();}} className="space-y-4"><div className="grid sm:grid-cols-2 gap-4"><div><Label htmlFor="armory-reference">Reference</Label><Input id="armory-reference" value={form.reference} maxLength={100} required onChange={e=>setForm(f=>({...f,reference:e.target.value}))}/></div><div><Label htmlFor="armory-title">Title</Label><Input id="armory-title" value={form.title} maxLength={200} required onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div>
    {["personnel","custody","certification"].includes(tab)&&<div><Label>Officer</Label><SearchableSelect value={form.profile_id} onValueChange={v=>setForm(f=>({...f,profile_id:v}))} options={context.staff.filter(s=>s.org_unit_id===selectedUnit).map(s=>({value:s.id,label:staffName(s.id)}))} placeholder="Select an existing officer"/></div>}
    {["custody","transfer","maintenance"].includes(tab)&&<div><Label>Weapon (from register) *</Label><SearchableSelect value={form.asset_id} onValueChange={v=>setForm(f=>({...f,asset_id:v}))} options={records.filter(r=>r.kind==="weapon" && r.status!=="archived").map(r=>({value:r.id,label:`${r.details.serial ?? r.reference} · ${r.details.weapon_type ?? "Weapon"} ${r.details.model ?? r.title} · ${r.details.condition ?? "Condition not set"} · ${statusLabel(r.status)}`}))}/></div>}
    {tab==="transfer"&&<div><Label>Receiving command</Label><SearchableSelect value={form.destination_unit_id} onValueChange={v=>setForm(f=>({...f,destination_unit_id:v}))} options={context.commands.filter(c=>c.id!==selectedUnit).map(c=>({value:c.id,label:c.name}))}/></div>}
    {["finding","corrective"].includes(tab)&&<div><Label>{tab==="finding"?"Audit":"Finding"}</Label><SearchableSelect value={form.parent_id} onValueChange={v=>setForm(f=>({...f,parent_id:v}))} options={records.filter(r=>r.kind===(tab==="finding"?"audit":"finding") && !["closed","archived"].includes(r.status)).map(r=>({value:r.id,label:`${r.reference} · ${r.title}`}))}/></div>}
    {(ARMORY_FIELDS[tab as ArmoryKind]??[]).map(f=><div key={f.key}><Label htmlFor={`armory-${f.key}`}>{f.label}{f.required?" *":""}</Label>{f.type==="date"?<DateInput id={`armory-${f.key}`} value={form.details[f.key]??""} onChange={e=>field(f.key,e.target.value)} required={f.required}/>:f.options?<SearchableSelect value={form.details[f.key]??""} onValueChange={v=>field(f.key,v)} options={f.options.map(v=>({value:v,label:v}))}/>:<Input id={`armory-${f.key}`} type={f.type==="number"?"number":"text"} min={f.type==="number"?0:undefined} step={f.type==="number"?1:undefined} maxLength={1000} value={form.details[f.key]??""} required={f.required} onChange={e=>field(f.key,e.target.value)}/>}</div>)}</div><div><Label htmlFor="armory-notes">Notes</Label><Textarea id="armory-notes" maxLength={2000} value={form.details.notes??""} onChange={e=>field("notes",e.target.value)}/></div><div><Label htmlFor="armory-reason">Reason</Label><Textarea id="armory-reason" value={form.reason} required minLength={3} maxLength={1000} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/></div><DialogFooter><Button variant="outline" type="button" onClick={()=>setDialog(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending?"Saving…":"Save record"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={!!decision} onOpenChange={o=>{if(!o)setDecision(null);}}><DialogContent><DialogHeader><DialogTitle className="capitalize">{statusLabel(decision?.action??"")} · {decision?.record.reference}</DialogTitle></DialogHeader>{decision?.action==="adjust"&&<div><Label htmlFor="armory-adjust-quantity">New reconciled quantity</Label><Input id="armory-adjust-quantity" type="number" min={0} max={100000000} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)}/></div>}<Label htmlFor="armory-decision-reason">Reason</Label><Textarea id="armory-decision-reason" value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/><DialogFooter><Button variant="outline" onClick={()=>setDecision(null)}>Cancel</Button><Button disabled={transition.isPending||reason.trim().length<3} onClick={()=>transition.mutate()}>Confirm</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={o=>{if(!o)setDetail(null);}}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{detail?.reference} · {detail?.title}</DialogTitle></DialogHeader>{detail&&<><Badge variant="outline" className="w-fit capitalize">{statusLabel(detail.status)}</Badge><dl className="grid sm:grid-cols-2 gap-4"><div><dt className="text-muted-foreground">Officer</dt><dd>{staffName(detail.profile_id)}</dd></div>{Object.entries(detail.details).map(([k,v])=><div key={k}><dt className="text-muted-foreground capitalize">{k.replace(/_/g," ")}</dt><dd className="break-words">{ /^\d{4}-\d{2}-\d{2}$/.test(v)?dateLabel(v):v}</dd></div>)}</dl><h3 className="font-semibold">Workflow history</h3>{(eventsQuery.data??[]).filter(e=>e.record_id===detail.id).map(e=><div key={e.id} className="border-t py-2"><div>{dateLabel(e.created_at)} · {e.actor_name} · {statusLabel(e.action)}</div><p className="text-muted-foreground break-words">{e.reason}</p></div>)}</>}</DialogContent></Dialog>
  </div>;
}