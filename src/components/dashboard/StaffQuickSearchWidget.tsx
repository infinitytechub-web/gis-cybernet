import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, Compass, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Staff-scoped quick search.
 *  - No staff-directory lookups, no application searches, no admin/system pages.
 *  - Searches only across pages a regular staff member is allowed to use,
 *    plus a single shortcut to *their own* profile.
 *  - Pure client-side filtering — no privileged RPC calls.
 */

type Target = { label: string; path: string; keywords: string[]; group: string };

// Allow-list. Anything sensitive (Staff Management, Approvals, Audit Log,
// Recycle Bin, IP Blocks, Admin Matrix, Settings, etc.) is intentionally absent.
const STAFF_TARGETS: Target[] = [
  { label: "My Profile",        path: "/my-profile",  keywords: ["my", "profile", "account", "details"], group: "Me" },
  { label: "My Shift",          path: "/my-shift",    keywords: ["my", "shift", "tracker", "today"],     group: "Me" },
  { label: "Attendance",        path: "/attendance",  keywords: ["attendance", "checkin", "clock"],      group: "Me" },
  { label: "Leave Requests",    path: "/leave",       keywords: ["leave", "vacation", "absence", "off"], group: "Me" },
  { label: "Excuse Duty",       path: "/excuse-duty", keywords: ["excuse", "duty", "sick", "exempt"],    group: "Me" },

  { label: "Duty Roster",       path: "/roster",         keywords: ["roster", "duty", "schedule"],            group: "Schedules" },
  { label: "Guard Schedule",    path: "/guard-schedule", keywords: ["guard", "schedule", "shift"],            group: "Schedules" },
  { label: "Shifts",            path: "/shifts",         keywords: ["shift", "rotation", "night", "groups"],  group: "Schedules" },
  { label: "Holidays",          path: "/holidays",       keywords: ["holiday", "public", "ghana"],            group: "Schedules" },

  { label: "Announcements",     path: "/announcements",  keywords: ["announcement", "broadcast", "news"],     group: "Information" },
  { label: "Staff Directory",   path: "/directory",      keywords: ["staff", "directory", "officers", "people", "contacts"], group: "Information" },
  { label: "Departments",       path: "/departments",    keywords: ["department", "unit"],                    group: "Information" },
];

function matchScore(t: Target, q: string): number {
  const ql = q.toLowerCase().trim();
  if (!ql) return 0;
  const hay = (t.label + " " + t.keywords.join(" ")).toLowerCase();
  if (hay.includes(ql)) return ql.length >= 3 ? 50 : 30;
  let s = 0;
  for (const tok of ql.split(/\s+/).filter(Boolean)) if (hay.includes(tok)) s += 10;
  return s;
}

export default function StaffQuickSearchWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  // "/" focuses the input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        document.getElementById("staff-quick-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return STAFF_TARGETS
      .map((t) => ({ ...t, _score: matchScore(t, q) }))
      .filter((t) => t._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 8);
  }, [q]);

  useEffect(() => { setActive(0); }, [q]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      navigate(results[active].path);
      setQ("");
    } else if (e.key === "Escape") {
      setQ("");
    }
  };

  const groups = useMemo(() => {
    const g: Record<string, typeof results> = {};
    results.forEach((r) => { (g[r.group] ||= []).push(r); });
    return g;
  }, [results]);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Quick Search
          <Badge variant="outline" className="text-[10px] ml-auto">Staff</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="staff-quick-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search your pages — roster, leave, profile…  (press / to focus)"
            className="pl-8"
            autoComplete="off"
            aria-label="Staff quick search"
          />
        </div>

        {q.trim() && (
          <div className="rounded border bg-background max-h-[320px] overflow-y-auto">
            {results.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No matches.</div>
            ) : (
              Object.entries(groups).map(([group, rows]) => (
                <div key={group}>
                  <div className="sticky top-0 bg-muted/60 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                    {group}
                  </div>
                  {rows.map((r) => {
                    const idx = results.indexOf(r);
                    const isActive = idx === active;
                    const Icon = group === "Me" ? User : Compass;
                    return (
                      <button
                        key={`${group}-${idx}`}
                        onClick={() => { navigate(r.path); setQ(""); }}
                        onMouseEnter={() => setActive(idx)}
                        className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs border-b last:border-b-0 ${
                          isActive ? "bg-primary/10" : "hover:bg-accent/40"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium truncate text-foreground">{r.label}</span>
                          <span className="block text-muted-foreground truncate text-[10px]">{r.path}</span>
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
            Jump to your roster, shift, leave, profile, and more. Use ↑/↓ and Enter to navigate.
            {user ? "" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
