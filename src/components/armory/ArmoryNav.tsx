import { NavLink } from "react-router-dom";
import { Crosshair, LayoutDashboard, BarChart3, GraduationCap, ClipboardCheck, FileBarChart, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/armory-weapons", label: "Workspace", icon: Crosshair, end: true },
  { to: "/armory-weapons/dashboard", label: "Command Dashboard", icon: LayoutDashboard },
  { to: "/armory-weapons/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/armory-weapons/training", label: "Training Status", icon: GraduationCap },
  { to: "/armory-weapons/approvals", label: "Approvals", icon: ClipboardCheck },
  { to: "/armory-weapons/report", label: "Monthly Report", icon: FileBarChart },
  { to: "/armory-weapons/my", label: "My Armory Portal", icon: UserRound },
];

/** Shared Armory & Weapons menu: wraps onto new rows instead of scrolling, so no item is hidden on small screens. */
export function ArmoryNav() {
  return (
    <nav aria-label="Armory & Weapons" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => cn("flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground")}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="leading-tight">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
