import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cake, PartyPopper, BellRing } from "lucide-react";
import { format, differenceInCalendarDays, setYear } from "date-fns";

type Bday = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  photo_url: string | null;
  date_of_birth: string;
  bday_month: number;
  bday_day: number;
};

/**
 * Birthday calendar widget — shows staff with birthdays this month.
 * Today's birthdays get a celebratory ring; staff celebrating within the
 * next 14 days (two weeks) get a green pulse "Heads-up" alert indicator
 * and a banner alert appears at the top of the card.
 */
export default function BirthdayWidget() {
  const today = new Date();
  const month = today.getMonth() + 1;

  const { data: birthdays = [], isLoading } = useQuery({
    queryKey: ["staff-birthdays-month", month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_birthdays")
        .select("id, first_name, last_name, staff_id, photo_url, date_of_birth, bday_month, bday_day")
        .eq("bday_month", month)
        .order("bday_day", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Bday[];
    },
    refetchInterval: 60_000 * 30, // 30 min
  });

  const enriched = useMemo(() => {
    return birthdays.map((b) => {
      const next = setYear(new Date(today.getFullYear(), b.bday_month - 1, b.bday_day), today.getFullYear());
      const days = differenceInCalendarDays(next, today);
      return { ...b, daysAway: days, isToday: days === 0, isHeadsUp: days > 0 && days <= 14 };
    });
  }, [birthdays, today]);

  const todays = enriched.filter((b) => b.isToday);
  const upcoming = enriched.filter((b) => !b.isToday && b.daysAway >= 0);
  const passed = enriched.filter((b) => b.daysAway < 0);

  return (
    <Card className="border-l-4 border-l-pink-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="relative inline-flex">
            <Cake className="h-4 w-4 text-pink-600" />
            {/* Cyan blinking notification dot */}
            <span className="absolute -top-1 -right-1 inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
            </span>
          </span>
          Birthdays this month
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {format(today, "MMMM yyyy")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : enriched.length === 0 ? (
          <div className="text-xs text-muted-foreground">No birthdays recorded for this month.</div>
        ) : (
          <>
            {enriched.filter((b) => b.isHeadsUp).length > 0 && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-800 dark:text-emerald-200"
              >
                <BellRing className="h-3.5 w-3.5 mt-0.5 animate-pulse" />
                <span>
                  <strong>{enriched.filter((b) => b.isHeadsUp).length}</strong> birthday
                  {enriched.filter((b) => b.isHeadsUp).length === 1 ? "" : "s"} coming up in the next 2 weeks — prepare in advance.
                </span>
              </div>
            )}
            {todays.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-pink-700 dark:text-pink-300 flex items-center gap-1">
                  <PartyPopper className="h-3.5 w-3.5" /> Today
                </div>
                {todays.map((b) => (
                  <BirthdayRow key={b.id} b={b} variant="today" />
                ))}
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Upcoming
                </div>
                {upcoming.map((b) => (
                  <BirthdayRow key={b.id} b={b} variant={b.isHeadsUp ? "headsup" : "default"} />
                ))}
              </div>
            )}
            {passed.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">Earlier this month</div>
                {passed.map((b) => (
                  <BirthdayRow key={b.id} b={b} variant="passed" />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BirthdayRow({
  b,
  variant,
}: {
  b: Bday & { daysAway: number; isToday: boolean; isHeadsUp: boolean };
  variant: "today" | "headsup" | "default" | "passed";
}) {
  const ringClass =
    variant === "today"
      ? "ring-2 ring-pink-500 ring-offset-1"
      : variant === "headsup"
      ? "ring-2 ring-emerald-500 ring-offset-1 animate-pulse"
      : "";

  const indicatorDot =
    variant === "headsup" ? (
      <span
        className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse"
        title="Birthday in 2 weeks or less"
        aria-label="Birthday in 2 weeks or less"
      />
    ) : null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className={`h-7 w-7 rounded-full bg-muted flex items-center justify-center overflow-hidden ${ringClass}`}
      >
        {b.photo_url ? (
          <img src={b.photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[10px] font-semibold">
            {(b.first_name?.[0] ?? "?")}{(b.last_name?.[0] ?? "")}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">
          {b.first_name} {b.last_name}{" "}
          <span className="text-muted-foreground font-normal">{b.staff_id}</span>
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          {format(new Date(b.date_of_birth), "do MMMM")}{" "}
          {variant === "today" && <span className="text-pink-600 font-medium">· Today!</span>}
          {variant === "headsup" && (
            <span className="text-emerald-600 font-medium">· in {b.daysAway}d</span>
          )}
          {variant === "passed" && (
            <span className="text-muted-foreground">· {Math.abs(b.daysAway)}d ago</span>
          )}
          {indicatorDot}
        </div>
      </div>
    </div>
  );
}
