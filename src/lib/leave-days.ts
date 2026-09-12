import { eachDayOfInterval, format, isWeekend } from "date-fns";

export type HolidayDate = { date: string; recurring: boolean };

export function isLeaveHoliday(day: Date, holidays: HolidayDate[]) {
  const iso = format(day, "yyyy-MM-dd");
  const monthDay = format(day, "MM-dd");
  return holidays.some((holiday) =>
    holiday.recurring ? holiday.date.slice(5) === monthDay : holiday.date === iso,
  );
}

export function countLeaveDays(
  start: string,
  end: string,
  leaveType: string,
  holidays: HolidayDate[],
) {
  const first = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return 0;
  const days = eachDayOfInterval({ start: first, end: last });
  if (["study", "maternity"].includes(leaveType)) return days.length;
  return days.filter((day) => !isWeekend(day) && !isLeaveHoliday(day, holidays)).length;
}