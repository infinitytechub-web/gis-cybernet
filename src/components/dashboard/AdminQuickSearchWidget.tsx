import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, ArrowRight, User, FileText, Compass, Command as CommandIcon,
} from "lucide-react";

// Curated nav targets. Keywords power fuzzy matching.
const NAV_TARGETS: { label: string; path: string; keywords: string[]; group: string }[] = [
  { label: "Staff Directory", path: "/directory", keywords: ["staff", "directory", "officers", "people"], group: "People" },
  { label: "Staff Management", path: "/staff", keywords: ["staff", "manage", "edit"], group: "People" },
  { label: "Pending Staff Approvals", path: "/staff-approvals/pending", keywords: ["approvals", "pending", "stub", "matches"], group: "People" },
  { label: "Profile Change Approvals", path: "/staff-approvals/profile-changes", keywords: ["profile", "change", "approval", "review"], group: "People" },
  { label: "Account Approvals", path: "/staff-approvals/accounts", keywords: ["account", "approval", "registration"], group: "People" },
  { label: "Departments", path: "/departments", keywords: ["departments", "units"], group: "People" },
  { label: "Roles", path: "/roles", keywords: ["roles", "rbac"], group: "People" },
  { label: "Command Roles", path: "/command-roles", keywords: ["command", "roles"], group: "People" },

  { label: "Duty Roster", path: "/roster", keywords: ["roster", "duty", "schedule"], group: "Operations" },
  { label: "Roster Import", path: "/roster/import", keywords: ["roster", "import", "upload", "xlsx"], group: "Operations" },
  { label: "Guard Schedule", path: "/guard-schedule", keywords: ["guard", "schedule", "shift"], group: "Operations" },
  { label: "Shifts", path: "/shifts", keywords: ["shift", "rotation", "night"], group: "Operations" },
  { label: "Attendance", path: "/attendance", keywords: ["attendance", "checkin", "clock"], group: "Operations" },
  { label: "My Shift", path: "/my-shift", keywords: ["my", "shift", "tracker"], group: "Operations" },
  { label: "Operations", path: "/operations", keywords: ["operations", "ops"], group: "Operations" },
  { label: "Holding Center", path: "/holding", keywords: ["holding", "detention", "custody"], group: "Operations" },
  { label: "Enforcement", path: "/enforcement", keywords: ["enforcement", "arrests"], group: "Operations" },
  { label: "Front Desk", path: "/front-desk", keywords: ["front", "desk", "visa", "passport", "applicant"], group: "Operations" },
  { label: "Processing", path: "/processing", keywords: ["processing", "applications", "review"], group: "Operations" },
  { label: "Health & Lab", path: "/health-lab", keywords: ["health", "lab", "appointment", "medical"], group: "Operations" },
  { label: "Stores / Inventory", path: "/stores", keywords: ["stores", "inventory", "stock"], group: "Operations" },
  { label: "Procurement", path: "/procurement", keywords: ["procurement", "rfq", "po", "invoice", "contract"], group: "Operations" },

  { label: "Leave Requests", path: "/leave", keywords: ["leave", "vacation", "absence"], group: "HR" },
  { label: "Postings & Transfers", path: "/postings", keywords: ["posting", "transfer"], group: "HR" },
  { label: "Holidays", path: "/holidays", keywords: ["holiday", "public"], group: "HR" },
  { label: "Compliance", path: "/compliance", keywords: ["compliance", "expiry", "certificate"], group: "HR" },
  { label: "Appraisals", path: "/appraisals", keywords: ["appraisal", "performance"], group: "HR" },
  { label: "Excuse Duty", path: "/excuse-duty", keywords: ["excuse", "duty", "sick"], group: "HR" },
  { label: "My Profile", path: "/my-profile", keywords: ["my", "profile"], group: "HR" },

  { label: "Reports", path: "/reports", keywords: ["report"], group: "Information" },
  { label: "Analytics", path: "/analytics", keywords: ["analytics", "stats"], group: "Information" },
  { label: "Announcements", path: "/announcements", keywords: ["announcement", "broadcast"], group: "Information" },
  { label: "Interlink", path: "/interlink", keywords: ["interlink", "external", "scheduled"], group: "Information" },
  { label: "Audit Log", path: "/audit-log", keywords: ["audit", "log", "trail"], group: "Information" },
  { label: "Sensitive Access Log", path: "/sensitive-access-log", keywords: ["sensitive", "access", "log"], group: "Information" },
  { label: "Command Vault", path: "/command-vault", keywords: ["vault", "command"], group: "Information" },
  { label: "GPS Addresses", path: "/command-vault/gps", keywords: ["gps", "address", "map"], group: "Information" },
  { label: "Route History", path: "/route-history", keywords: ["route", "history", "tracking"], group: "Information" },

  { label: "Settings", path: "/settings", keywords: ["settings", "config", "preferences"], group: "System" },
  { label: "Admin Access Matrix", path: "/admin-access-matrix", keywords: ["admin", "matrix", "permissions"], group: "System" },
  { label: "Quarantine Inbox", path: "/quarantine", keywords: ["quarantine", "spam", "blocked"], group: "System" },
  { label: "IP Blocks", path: "/ip-blocks", keywords: ["ip", "block", "firewall"], group: "System" },
  { label: "Recycle Bin", path: "/recycle-bin", keywords: ["recycle", "bin", "deleted", "trash"], group: "System" },
  { label: "Commands", path: "/commands", keywords: ["commands", "regional"], group: "System" },
];

function matchScore(target: { label: string; keywords: string[] }, q: string): number {
  const ql = q.toLowerCase().trim();
  if (!ql) return 0;
  const hay = (target.label + " " + target.keywords.join(" ")).toLowerCase();
  if (hay.includes(ql)) return ql.length >= 3 ? 50 : 30;
  // token overlap
  const tokens = ql.split(/\s+/).filter(Boolean);
  let s = 0;
  for (const t of tokens) if (hay.includes(t)) s += 10;
  return s;
}

export default function AdminQuickSearchWidget() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  // Keyboard shortcut: "/" to focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        document.getElementById("admin-quick-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navResults = useMemo(() => {
    if (!q.trim()) return [];
    return NAV_TARGETS
      .map((t) => ({ ...t, _score: matchScore(t, q) }))
      .filter((t) => t._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 8);
  }, [q]);

  const { data: staffResults = [] } = useQuery({
    queryKey: ["admin-quick-search", "staff", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const term = `%${q.trim()}%`;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, rank, department, email")
        .or(`first_name.ilike.${term},last_name.ilike.${term},staff_id.ilike.${term},email.ilike.${term}`)
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10_000,
  });

  const { data: appResults = [] } = useQuery({
    queryKey: ["admin-quick-search", "apps", q],
    enabled: q.trim().length >= 3,
    queryFn: async () => {
      const term = `%${q.trim()}%`;
      const out: { id: string; ref: string; kind: string; name?: string }[] = [];
      const [pa, va] = await Promise.all([
        supabase.from("passport_applications").select("id, reference_number, applicant_first_name, applicant_last_name").or(`reference_number.ilike.${term},applicant_first_name.ilike.${term},applicant_last_name.ilike.${term}`).limit(4),
        supabase.from("visa_applications").select("id, reference_number, applicant_first_name, applicant_last_name").or(`reference_number.ilike.${term},applicant_first_name.ilike.${term},applicant_last_name.ilike.${term}`).limit(4),
      ]);
      pa.data?.forEach((r: any) => out.push({ id: r.id, ref: r.reference_number, kind: "Passport", name: `${r.applicant_first_name ?? ""} ${r.applicant_last_name ?? ""}`.trim() }));
      va.data?.forEach((r: any) => out.push({ id: r.id, ref: r.reference_number, kind: "Visa", name: `${r.applicant_first_name ?? ""} ${r.applicant_last_name ?? ""}`.trim() }));
      return out;
    },
    staleTime: 10_000,
  });

  type Row = { kind: "page" | "staff" | "app"; label: string; sublabel?: string; onSelect: () => void; group: string };
  const flatRows: Row[] = useMemo(() => {
    const rows: Row[] = [];
    navResults.forEach((r) => rows.push({
      kind: "page", group: r.group, label: r.label, sublabel: r.path,
      onSelect: () => { navigate(r.path); setQ(""); },
    }));
    staffResults.forEach((s: any) => rows.push({
      kind: "staff", group: "Staff",
      label: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.staff_id || s.email,
      sublabel: [s.staff_id, s.rank, s.department].filter(Boolean).join(" • "),
      onSelect: () => { navigate(`/staff/${s.id}`); setQ(""); },
    }));
    appResults.forEach((a) => rows.push({
      kind: "app", group: `${a.kind} Application`,
      label: a.ref || "(no reference)", sublabel: a.name,
      onSelect: () => { navigate(a.kind === "Passport" ? "/processing" : "/processing"); setQ(""); },
    }));
    return rows;
  }, [navResults, staffResults, appResults, navigate]);

  useEffect(() => { setActive(0); }, [q]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flatRows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && flatRows[active]) { e.preventDefault(); flatRows[active].onSelect(); }
    else if (e.key === "Escape") { setQ(""); }
  };

  const groups = useMemo(() => {
    const g: Record<string, Row[]> = {};
    flatRows.forEach((r) => { (g[r.group] ||= []).push(r); });
    return g;
  }, [flatRows]);

  const iconFor = (k: Row["kind"]) =>
    k === "page" ? <Compass className="h-3.5 w-3.5 text-primary" /> :
    k === "staff" ? <User className="h-3.5 w-3.5 text-secondary" /> :
    <FileText className="h-3.5 w-3.5 text-amber-600" />;

  return (
    <Card className="border-destructive/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CommandIcon className="h-4 w-4 text-destructive" />
          Admin Quick Search
          <Badge variant="outline" className="text-[10px] ml-auto">Admin only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="admin-quick-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search pages, staff, or applications…  (press / to focus)"
            className="pl-8"
            autoComplete="off"
          />
        </div>

        {q.trim() && (
          <div className="rounded border bg-background max-h-[360px] overflow-y-auto">
            {flatRows.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No matches.</div>
            ) : (
              Object.entries(groups).map(([group, rows]) => (
                <div key={group}>
                  <div className="sticky top-0 bg-muted/60 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                    {group}
                  </div>
                  {rows.map((r) => {
                    const idx = flatRows.indexOf(r);
                    const isActive = idx === active;
                    return (
                      <button
                        key={`${group}-${idx}`}
                        onClick={r.onSelect}
                        onMouseEnter={() => setActive(idx)}
                        className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs border-b last:border-b-0 ${
                          isActive ? "bg-primary/10" : "hover:bg-accent/40"
                        }`}
                      >
                        <span className="shrink-0">{iconFor(r.kind)}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium truncate text-foreground">{r.label}</span>
                          {r.sublabel && <span className="block text-muted-foreground truncate text-[10px]">{r.sublabel}</span>}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}

        {!q.trim() && (
          <p className="text-[11px] text-muted-foreground">
            Type to search across pages, staff records, and visa/passport application references. Use ↑/↓ and Enter to navigate.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
