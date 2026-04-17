import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Server, Database, FileCheck2, FlaskConical, Users, Crown, Star,
} from "lucide-react";

type Role = { title: string; lead?: boolean };
type Unit = {
  name: string;
  priority?: string;
  icon: any;
  accent: string; // tailwind classes for header strip
  ring: string;   // ring color
  description: string;
  roles: Role[];
};

const UNITS: Unit[] = [
  {
    name: "Cybersecurity & Risk Management",
    priority: "Top Priority",
    icon: ShieldCheck,
    accent: "from-purple-700 to-purple-900",
    ring: "border-purple-300 dark:border-purple-800",
    description: "Defends digital assets, manages cyber risk, and leads incident response.",
    roles: [
      { title: "Cybersecurity Analysts" },
      { title: "Cyber Threat Intelligence Analysts" },
      { title: "Information Assurance Specialists" },
    ],
  },
  {
    name: "IT Infrastructure & Systems Engineering",
    icon: Server,
    accent: "from-indigo-600 to-purple-800",
    ring: "border-indigo-300 dark:border-indigo-800",
    description: "Designs, deploys, and maintains the network, servers, and core systems.",
    roles: [
      { title: "IT Infrastructure Manager", lead: true },
      { title: "Network Architects" },
      { title: "Systems Engineers" },
    ],
  },
  {
    name: "Data Analytics & Intelligence",
    icon: Database,
    accent: "from-fuchsia-600 to-purple-800",
    ring: "border-fuchsia-300 dark:border-fuchsia-800",
    description: "Transforms operational data into actionable intelligence and decision support.",
    roles: [
      { title: "Data Scientists" },
      { title: "Intelligence Data Analysts" },
    ],
  },
  {
    name: "Information Governance & Compliance",
    icon: FileCheck2,
    accent: "from-amber-600 to-purple-800",
    ring: "border-amber-300 dark:border-amber-800",
    description: "Enforces policy, regulatory compliance, and information assurance standards.",
    roles: [
      { title: "Information Assurance Specialists" },
    ],
  },
  {
    name: "Cyber Operations & Innovation Lab",
    icon: FlaskConical,
    accent: "from-purple-600 to-amber-700",
    ring: "border-purple-300 dark:border-purple-800",
    description: "Runs offensive/defensive operations and prototypes new capabilities.",
    roles: [
      { title: "Cyber Operations Specialists" },
      { title: "Software Developers" },
    ],
  },
];

export function OrgStructureTab() {
  const totalRoles = UNITS.reduce((sum, u) => sum + u.roles.length, 0);

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <Card className="border-purple-200 dark:border-purple-900 bg-gradient-to-r from-purple-50 to-amber-50 dark:from-purple-950/40 dark:to-amber-950/30">
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-700 to-purple-900 flex items-center justify-center shadow-md shadow-purple-500/30">
              <Users className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-purple-900 dark:text-purple-200">MISD / CYBER Organisational Structure</h2>
              <p className="text-xs text-muted-foreground">Defined roles & functional units aligned with global cyber best practices.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-700 text-amber-200 hover:bg-purple-700">{UNITS.length} Units</Badge>
            <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">{totalRoles} Roles</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Unit cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {UNITS.map((u) => (
          <Card key={u.name} className={`border-2 ${u.ring} overflow-hidden`}>
            <div className={`h-1.5 bg-gradient-to-r ${u.accent}`} />
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className={`h-9 w-9 rounded-md bg-gradient-to-br ${u.accent} flex items-center justify-center shadow shadow-purple-500/20`}>
                    <u.icon className="h-4.5 w-4.5 text-amber-200" />
                  </div>
                  <div>
                    <CardTitle className="text-sm leading-tight">{u.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{u.description}</p>
                  </div>
                </div>
                {u.priority && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500 shrink-0">
                    <Star className="h-3 w-3 mr-1 fill-white" />{u.priority}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <ul className="space-y-1.5">
                {u.roles.map((r) => (
                  <li
                    key={r.title}
                    className="flex items-center justify-between gap-2 text-sm py-1.5 px-2.5 rounded border border-purple-100 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20"
                  >
                    <span className="flex items-center gap-2">
                      {r.lead ? <Crown className="h-3.5 w-3.5 text-amber-600" /> : <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />}
                      <span className={r.lead ? "font-semibold text-purple-900 dark:text-purple-200" : ""}>{r.title}</span>
                    </span>
                    {r.lead && (
                      <Badge variant="outline" className="text-[10px] h-5 border-amber-500 text-amber-700 dark:text-amber-300">Unit Lead</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
