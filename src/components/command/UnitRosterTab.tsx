/**
 * UNIT ROSTER TAB — the command console's order of battle: every unit with its
 * commander, rank, posting and contact details. Each row deep-links into the
 * Unit Dashboard for that unit (`/unit-dashboard?unit=<id>`), where the same
 * data is shown alongside detainees, cases and vehicles.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ExternalLink, Mail, Phone, ShieldCheck, Users } from "lucide-react";
import { ExportMenu } from "@/components/ui/export-menu";
import { useUnitRoster, type UnitRosterRow } from "@/hooks/useUnitRoster";
import { ORG_UNIT_TYPE_LABELS, ORG_UNIT_TYPES, type OrgUnitType } from "@/lib/org-hierarchy";
import { roleLabel } from "@/lib/role-labels";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function CommanderCell({ row }: { row: UnitRosterRow }) {
  if (!row.commander) {
    return <Badge variant="outline" className="text-muted-foreground">Vacant</Badge>;
  }
  const c = row.commander;
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-8 w-8">
        {c.photo_signed_url && <AvatarImage src={c.photo_signed_url} alt={`${c.full_name} photo`} loading="lazy" />}
        <AvatarFallback className="text-xs">{initials(c.full_name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{c.full_name}</div>
        <div className="truncate text-xs text-muted-foreground">{c.staff_id ?? "—"}</div>
      </div>
    </div>
  );
}

export default function UnitRosterTab({ compact = false }: { compact?: boolean }) {
  const { rows, loading, error } = useUnitRoster();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<OrgUnitType | "all">("all");
  const [staffed, setStaffed] = useState<"all" | "commanded" | "vacant">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== "all" && r.unit_type !== type) return false;
      if (staffed === "commanded" && !r.commander) return false;
      if (staffed === "vacant" && r.commander) return false;
      if (!q) return true;
      return [
        r.unit_name,
        r.unit_code,
        r.unit_path,
        r.commander?.full_name,
        r.commander?.staff_id,
        r.commander?.rank,
        r.commander?.phone,
        r.commander?.email,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, type, staffed]);

  const vacancies = rows.filter((r) => !r.commander).length;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unit roster unavailable</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
              Unit roster
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {loading
                ? "Loading units…"
                : `${rows.length} units · ${rows.length - vacancies} commanded · ${vacancies} awaiting a commander`}
            </p>
          </div>

          {!compact && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={type} onValueChange={(v) => setType(v as OrgUnitType | "all")}>
                <SelectTrigger className="w-[190px]" aria-label="Filter by unit level">
                  <SelectValue placeholder="Any level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any level</SelectItem>
                  {ORG_UNIT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{ORG_UNIT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={staffed} onValueChange={(v) => setStaffed(v as typeof staffed)}>
                <SelectTrigger className="w-[170px]" aria-label="Filter by command status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All units</SelectItem>
                  <SelectItem value="commanded">Commanded</SelectItem>
                  <SelectItem value="vacant">Vacant command</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search unit, commander, contact…"
                className="w-[240px]"
                aria-label="Search unit roster"
              />
              <ExportMenu
                label="Export units"
                getData={() => ({
                  title: "Unit Roster — Order of Battle",
                  filename: `unit_roster_${new Date().toISOString().slice(0, 10)}`,
                  subtitle: `${filtered.length} units · Generated ${new Date().toLocaleString("en-GB")}`,
                  headers: [
                    "Unit", "Code", "Level", "Posting path", "Commander", "Staff ID", "Command role",
                    "Rank", "Date joined service", "Years of service", "Phone", "Email",
                    "Posted strength", "Branch strength", "Status",
                  ],
                  rows: filtered.map((r) => [
                    r.unit_name,
                    r.unit_code ?? "—",
                    ORG_UNIT_TYPE_LABELS[r.unit_type] ?? r.unit_type,
                    r.unit_path,
                    r.commander?.full_name ?? "Vacant",
                    r.commander?.staff_id ?? "—",
                    r.commander_role ? roleLabel(r.commander_role) : "—",
                    r.commander?.rank ?? "—",
                    r.commander?.date_joined_service
                      ? new Date(r.commander.date_joined_service).toLocaleDateString("en-GB")
                      : "—",
                    r.commander?.service_label ?? "—",
                    r.commander?.phone ?? "—",
                    r.commander?.email ?? "—",
                    String(r.strength),
                    String(r.branch_strength),
                    r.is_active ? "Active" : "Inactive",
                  ]),
                })}
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No units match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <caption className="sr-only">Units with commander, rank, posting and contact details</caption>
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3">Unit</th>
                  <th scope="col" className="py-2 pr-3">Commander</th>
                  <th scope="col" className="py-2 pr-3">Rank</th>
                  <th scope="col" className="py-2 pr-3">Service years</th>
                  <th scope="col" className="py-2 pr-3">Posting</th>
                  <th scope="col" className="py-2 pr-3">Contact</th>
                  <th scope="col" className="py-2 pr-3">Strength</th>
                  <th scope="col" className="py-2 text-right">Dashboard</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.unit_id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.unit_name}</span>
                        {r.unit_code && <Badge variant="outline">{r.unit_code}</Badge>}
                        {!r.is_active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ORG_UNIT_TYPE_LABELS[r.unit_type] ?? r.unit_type}
                        {r.parent_name ? ` · under ${r.parent_name}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <CommanderCell row={r} />
                      {r.commander_role && (
                        <Badge className="mt-1" variant="secondary">
                          <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                          {roleLabel(r.commander_role)}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3">{r.commander?.rank ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {r.commander?.service_label ? (
                        <>
                          <div className="text-xs font-medium">{r.commander.service_label}</div>
                          {r.commander.date_joined_service && (
                            <div className="text-xs text-muted-foreground">
                              Joined {new Date(r.commander.date_joined_service).toLocaleDateString("en-GB")}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="text-xs">{r.unit_path}</div>
                      {r.commander?.unit && (
                        <div className="text-xs text-muted-foreground">Posted: {r.commander.unit}</div>
                      )}
                      {r.commander?.department && (
                        <div className="text-xs text-muted-foreground">{r.commander.department}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.commander?.phone ? (
                        <a href={`tel:${r.commander.phone}`} className="flex items-center gap-1 text-xs hover:underline">
                          <Phone className="h-3 w-3" aria-hidden="true" />{r.commander.phone}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">No phone</span>
                      )}
                      {r.commander?.email && (
                        <a href={`mailto:${r.commander.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                          <Mail className="h-3 w-3" aria-hidden="true" />{r.commander.email}
                        </a>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1 text-xs">
                        <Users className="h-3 w-3" aria-hidden="true" />
                        {r.strength} posted
                      </div>
                      <div className="text-xs text-muted-foreground">{r.branch_strength} in branch</div>
                    </td>
                    <td className="py-2 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/unit-dashboard?unit=${r.unit_id}`} aria-label={`Open unit dashboard for ${r.unit_name}`}>
                          Open <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
