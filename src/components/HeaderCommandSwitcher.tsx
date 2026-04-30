import { useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useConfidentialityCommands } from "@/hooks/useConfidentialityCommands";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Crown, ChevronDown, Pin, Settings, LayoutDashboard } from "lucide-react";

/**
 * Header switcher to jump between command workspaces (admin only).
 * Renders a compact button on the dashboard / command pages.
 */
export function HeaderCommandSwitcher() {
  const { isAdmin } = useAuth();
  const { data: commands = [] } = useConfidentialityCommands();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ slug?: string }>();

  // Show on dashboard or any /command/:slug route.
  const onDashboard = location.pathname === "/" || location.pathname === "/dashboard";
  const onCommandRoute = location.pathname.startsWith("/command/");
  const visible = isAdmin && (onDashboard || onCommandRoute) && commands.length > 0;

  const active = useMemo(
    () => commands.find((c) => c.slug === params.slug),
    [commands, params.slug],
  );

  if (!visible) return null;

  const label = active ? active.name : "Main Dashboard";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 max-w-[220px] hidden md:inline-flex"
          aria-label="Switch command workspace"
        >
          <Crown className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span className="truncate text-xs font-medium">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel>Command workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/dashboard")}>
          <LayoutDashboard className="h-4 w-4 mr-2 text-blue-600" />
          <span className="flex-1">Main Dashboard</span>
          {!active && <span className="text-[10px] text-primary">●</span>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {commands.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => navigate(`/command/${c.slug}`)}
            className="gap-2"
          >
            {c.pinned
              ? <Pin className="h-4 w-4 text-amber-600 shrink-0" />
              : <Crown className="h-4 w-4 text-[hsl(220,80%,40%)] shrink-0" />}
            <span className="flex-1 truncate">{c.name}</span>
            {active?.id === c.id && <span className="text-[10px] text-primary">●</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/commands")}>
          <Settings className="h-4 w-4 mr-2 text-slate-600" />
          Manage commands
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
