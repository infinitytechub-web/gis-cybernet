import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Sparkles, Box, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExportMenu } from "@/components/ui/export-menu";
import { cn } from "@/lib/utils";
import { GROUP_COLORS, type ShiftGroup } from "@/lib/shift-rotation";
import { useShiftRotationConfig } from "@/hooks/useShiftRotationConfig";

// Fallback colour for letters outside A–D when admin defines a custom pattern.
const FALLBACK_TONE = {
  bg: "bg-muted",
  text: "text-foreground",
  border: "border-border",
  solid: "bg-foreground/60",
} as const;
function tone(g: string) {
  return (GROUP_COLORS as Record<string, typeof FALLBACK_TONE>)[g] ?? FALLBACK_TONE;
}

interface Props {
  /** Staff member's assigned shift group (A/B/C/D). */
  staffGroup: string | null | undefined;
  /** Optional staff name for the header chip. */
  staffName?: string;
  /** Profile id used to look up admin-approved overrides. */
  profileId?: string | null;
  /** Optional staff identifier for the export header. */
  staffId?: string | null;
}

type AssignmentRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  shifts: { id: string; name: string } | null;
};

/**
 * Self-view rotation calendar driven by the published Amasaman 4-day rotation.
 * Renders a 3D perspective grid where the staff member's on-duty days lift
 * forward and glow, while off-duty days recede.
 */
export function MyShiftRotationCalendar({ staffGroup, staffName, profileId, staffId }: Props) {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const myGroup = (staffGroup?.toUpperCase() ?? null) as ShiftGroup | string | null;
  const { config, groupForDate } = useShiftRotationConfig();

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  // Admin-approved overrides (rows in shift_assignments). Any assignment overlapping
  // a calendar date overrides whatever the rotation pattern would have produced —
  // marking that day as "on duty" with the assigned shift name shown.
  const { data: overrides = [] } = useQuery({
    queryKey: ["my-rotation-overrides", profileId, format(monthStart, "yyyy-MM")],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("id, start_date, end_date, shifts(id, name)")
        .eq("profile_id", profileId!)
        .lte("start_date", format(monthEnd, "yyyy-MM-dd"))
        .or(`end_date.is.null,end_date.gte.${format(monthStart, "yyyy-MM-dd")}`);
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentRow[];
    },
  });

  /** Returns the override (if any) covering the given date. */
  const overrideFor = useMemo(() => {
    return (d: Date): AssignmentRow | null => {
      const key = format(d, "yyyy-MM-dd");
      return overrides.find((a) => key >= a.start_date && key <= (a.end_date ?? "9999-12-31")) ?? null;
    };
  }, [overrides]);

  /** A day is on duty if (a) admin override covers it OR (b) the rotation matches my group. */
  const isOnDuty = useMemo(() => {
    return (d: Date): boolean => {
      if (overrideFor(d)) return true;
      return !!myGroup && groupForDate(d) === myGroup;
    };
  }, [myGroup, groupForDate, overrideFor]);

  const onDutyDates = useMemo(
    () => days.filter((d) => isSameMonth(d, cursor) && isOnDuty(d)),
    [days, cursor, isOnDuty],
  );

  const nextOnDuty = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      if (isOnDuty(d)) return d;
    }
    return null;
  }, [isOnDuty]);

  const overrideCount = useMemo(
    () => onDutyDates.filter((d) => !!overrideFor(d)).length,
    [onDutyDates, overrideFor],
  );

  const buildExportPayload = () => {
    const fullName = staffName?.trim() || "Staff";
    const subtitle = [
      `Staff: ${fullName}${staffId ? ` (${staffId})` : ""}`,
      `Group: ${myGroup ?? "—"}`,
      `Period: ${format(monthStart, "dd MMM yyyy")} – ${format(monthEnd, "dd MMM yyyy")}`,
      `On-duty days: ${onDutyDates.length}${overrideCount ? ` (${overrideCount} admin override${overrideCount === 1 ? "" : "s"})` : ""}`,
    ].join(" · ");
    return {
      title: `My On-Duty Rotation — ${format(cursor, "MMMM yyyy")}`,
      filename: `my-rotation-${format(cursor, "yyyy-MM")}`,
      subtitle,
      headers: ["Date", "Day", "Group", "Source", "Assigned shift"],
      rows: onDutyDates.map((d) => {
        const ov = overrideFor(d);
        return [
          format(d, "yyyy-MM-dd"),
          format(d, "EEEE"),
          ov ? "OVR" : (myGroup ?? ""),
          ov ? "Admin override" : "Rotation",
          ov?.shifts?.name ?? "—",
        ];
      }),
    };
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Box className="h-4 w-4 text-primary" />
              My Rotation — {format(cursor, "MMMM yyyy")}
            </CardTitle>
            <CardDescription>
              Auto-generated from the Amasaman 2026 4-day rotation (A → B → C → D).
              {myGroup ? (
                <> Days where <strong>Group {myGroup}</strong> is on duty are lifted toward you.</>
              ) : (
                <> No shift group is assigned to your profile yet — ask an admin to set one.</>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {myGroup && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs px-2 py-1 border",
                  tone(myGroup).bg,
                  tone(myGroup).text,
                  tone(myGroup).border,
                )}
              >
                {staffName ? `${staffName} · ` : ""}Group {myGroup}
              </Badge>
            )}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-muted-foreground">On-duty days this month</div>
            <div className="text-lg font-semibold tabular-nums">
              {onDutyDates.length}
              <span className="text-xs font-normal text-muted-foreground"> / {days.filter((d) => isSameMonth(d, cursor)).length}</span>
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-muted-foreground">Next on-duty</div>
            <div className="text-lg font-semibold">
              {nextOnDuty ? format(nextOnDuty, "EEE, dd MMM") : "—"}
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-2 col-span-2 md:col-span-2">
            <div className="text-muted-foreground mb-1">Rotation legend</div>
            <div className="flex flex-wrap gap-2">
              {config.pattern.map((g) => (
                <span
                  key={g}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                    tone(g).bg,
                    tone(g).text,
                    tone(g).border,
                    myGroup === g && "ring-2 ring-offset-1 ring-primary",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", tone(g).solid)} />
                  Group {g}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 3D perspective grid */}
        <div
          className="rounded-lg border bg-gradient-to-b from-muted/40 to-background p-3 md:p-4 overflow-x-auto"
          style={{ perspective: "1100px" }}
        >
          <div
            className="min-w-[700px] mx-auto"
            style={{
              transform: "rotateX(14deg)",
              transformStyle: "preserve-3d",
              transformOrigin: "center top",
            }}
          >
            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-[11px] font-medium text-muted-foreground text-center py-1">
                  {d}
                </div>
              ))}
            </div>

            {Array.from({ length: days.length / 7 }).map((_, wIdx) => {
              const weekDays = days.slice(wIdx * 7, wIdx * 7 + 7);
              return (
                <div key={wIdx} className="grid grid-cols-7 gap-1.5 mb-1.5">
                  {weekDays.map((d) => {
                    const group = groupForDate(d);
                    const inMonth = isSameMonth(d, cursor);
                    const today = isToday(d);
                    const onDuty = !!myGroup && group === myGroup;
                    const colors = tone(group);

                    return (
                      <div
                        key={d.toISOString()}
                        className={cn(
                          "relative h-20 md:h-24 rounded-lg border p-2 flex flex-col justify-between transition-all duration-200",
                          inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground",
                          onDuty && [colors.bg, colors.border, "border-2 shadow-lg"],
                          !onDuty && "opacity-95",
                          today && "ring-2 ring-primary ring-offset-1",
                        )}
                        style={{
                          transform: onDuty
                            ? "translateZ(28px) translateY(-2px)"
                            : "translateZ(0px)",
                          boxShadow: onDuty
                            ? "0 18px 28px -16px hsl(var(--primary) / 0.45), 0 6px 12px -8px rgb(0 0 0 / 0.25)"
                            : "0 1px 2px rgb(0 0 0 / 0.04)",
                          transformStyle: "preserve-3d",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn("text-sm font-semibold tabular-nums", today && "text-primary")}>
                            {format(d, "d")}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center justify-center text-[10px] font-bold rounded-full h-5 w-5 border",
                              colors.bg,
                              colors.text,
                              colors.border,
                            )}
                            aria-label={`Group ${group}`}
                          >
                            {group}
                          </span>
                        </div>

                        {onDuty && (
                          <div className="flex items-center gap-1 text-[10px] font-medium">
                            <Sparkles className={cn("h-3 w-3", colors.text)} />
                            <span className={colors.text}>On duty</span>
                          </div>
                        )}

                        {today && (
                          <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 shadow">
                            TODAY
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Listing of upcoming on-duty days for accessibility / quick scan */}
        {myGroup && onDutyDates.length > 0 && (
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1.5">
              Your on-duty days in {format(cursor, "MMMM")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {onDutyDates.map((d) => (
                <span
                  key={d.toISOString()}
                  className={cn(
                    "text-xs font-mono px-2 py-0.5 rounded border",
                    tone(myGroup).bg,
                    tone(myGroup).text,
                    tone(myGroup).border,
                    isToday(d) && "ring-1 ring-primary",
                  )}
                >
                  {format(d, "EEE dd")}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
