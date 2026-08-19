// Appointment combobox (mirrors app_role list) + multi-select portfolio chips.
// Used inside the Staff/Employee form (src/pages/Staff.tsx).

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Briefcase, Plus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/role-labels";
import { toast } from "sonner";

// Mirror of public.app_role — kept in sync with RoleAssignmentsAdmin KNOWN_ROLES.
const APPOINTMENT_ROLES = [
  "admin","supervisor","staff","deputy_supervisor","deputy_shift_leader","deputy",
  "shift_leader","special_duties","front_desk","oic","2ic","shift_supervisor",
  "deputy_shift_supervisor","official","enquiry","storekeeper","procurement_officer",
  "staff_officer","ipse_supervisor","ipse_deputy_supervisor","head_of_administration",
  "chief_staff_officer","command_officer","head_of_processing","deputy_head_of_processing","medical_officer",
] as const;

const labelFor = (r: string) =>
  (ROLE_LABEL as Record<string, string>)[r] ?? r.replace(/_/g, " ");

interface Props {
  appointment: string;
  onAppointmentChange: (v: string) => void;
  portfolioIds: string[];
  onPortfolioIdsChange: (ids: string[]) => void;
}

export function AppointmentAndPortfolios({
  appointment, onAppointmentChange,
  portfolioIds, onPortfolioIdsChange,
}: Props) {
  const { isAdminOrSupervisor, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [apptOpen, setApptOpen] = useState(false);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [newPortfolio, setNewPortfolio] = useState("");

  const { data: portfolios = [] } = useQuery({
    queryKey: ["portfolios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolios")
        .select("id, name, description")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createPortfolio = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("portfolios")
        .insert({ name: name.trim() })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      onPortfolioIdsChange([...portfolioIds, p.id]);
      setNewPortfolio("");
      toast.success(`Portfolio "${p.name}" added`);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not create portfolio"),
  });

  const selectedPortfolios = useMemo(
    () => portfolios.filter((p) => portfolioIds.includes(p.id)),
    [portfolios, portfolioIds]
  );

  const toggle = (id: string) => {
    onPortfolioIdsChange(
      portfolioIds.includes(id)
        ? portfolioIds.filter((x) => x !== id)
        : [...portfolioIds, id]
    );
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Appointment & Portfolios</h3>
      </div>

      {/* Appointment combobox */}
      <div>
        <Label className="text-xs">Current Appointment</Label>
        <Popover open={apptOpen} onOpenChange={setApptOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={apptOpen}
              className={cn(
                "w-full justify-between font-normal h-9 mt-1",
                !appointment && "text-muted-foreground"
              )}
            >
              {appointment ? labelFor(appointment) : "Search & select appointment..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Type to search appointments..." />
              <CommandList className="max-h-[260px]">
                <CommandEmpty>No appointment found.</CommandEmpty>
                <CommandGroup>
                  {appointment && (
                    <CommandItem
                      value="__clear__"
                      onSelect={() => { onAppointmentChange(""); setApptOpen(false); }}
                    >
                      <X className="mr-2 h-4 w-4" /> Clear appointment
                    </CommandItem>
                  )}
                  {APPOINTMENT_ROLES.map((r) => (
                    <CommandItem
                      key={r}
                      value={`${labelFor(r)} ${r}`}
                      onSelect={() => { onAppointmentChange(r); setApptOpen(false); }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          appointment === r ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {labelFor(r)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <p className="text-[10px] text-muted-foreground mt-1">
          Mirrors the Manage User Roles list. Setting this here does not grant the role —
          go to Role Management to grant system access.
        </p>
      </div>

      {/* Portfolios multi-select */}
      <div>
        <Label className="text-xs">Portfolios</Label>
        <div className="mt-1 flex flex-wrap gap-1.5 min-h-[36px] items-center rounded-md border bg-background p-2">
          {selectedPortfolios.length === 0 && (
            <span className="text-xs text-muted-foreground">No portfolios assigned</span>
          )}
          {selectedPortfolios.map((p) => (
            <Badge key={p.id} variant="secondary" className="gap-1">
              {p.name}
              {isAdminOrSupervisor && (
                <button
                  type="button"
                  className="hover:text-destructive"
                  onClick={() => toggle(p.id)}
                  aria-label={`Remove ${p.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <Popover open={portfolioOpen} onOpenChange={setPortfolioOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button" variant="outline" size="sm"
                className="justify-between flex-1 min-w-0"
                disabled={!isAdminOrSupervisor}
              >
                <span className="truncate">Pick portfolios...</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search portfolios..." />
                <CommandList className="max-h-[240px]">
                  <CommandEmpty>No portfolio found.</CommandEmpty>
                  <CommandGroup>
                    {portfolios.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.name}
                        onSelect={() => toggle(p.id)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            portfolioIds.includes(p.id) ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="flex-1">{p.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {isAdmin && (
            <div className="flex gap-1">
              <Input
                placeholder="New portfolio name"
                value={newPortfolio}
                onChange={(e) => setNewPortfolio(e.target.value)}
                className="h-9"
              />
              <Button
                type="button" size="sm" variant="secondary"
                disabled={!newPortfolio.trim() || createPortfolio.isPending}
                onClick={() => createPortfolio.mutate(newPortfolio)}
              >
                {createPortfolio.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Plus className="h-4 w-4" /> Add</>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
