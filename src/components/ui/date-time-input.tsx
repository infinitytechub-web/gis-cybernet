import * as React from "react";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";

/** Day-first calendar and 24-hour time, preserving datetime-local values for existing forms. */
export function DateTimeInput({ value, onChange, id, disabled }: {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  id?: string;
  disabled?: boolean;
}) {
  const date = value?.slice(0, 10) ?? "";
  const time = value?.slice(11, 16) ?? "";
  return <div className="flex min-w-0 flex-wrap gap-2">
    <div className="min-w-[150px] flex-1">
      <DateInput id={id} value={date} disabled={disabled} onChange={(e) => onChange({ target: { value: e.target.value ? `${e.target.value}T${time || "00:00"}` : "" } })} />
    </div>
    <Input type="time" value={time} disabled={disabled} aria-label="Time (24-hour)" onChange={(e) => onChange({ target: { value: date ? `${date}T${e.target.value}` : "" } })} className="w-[125px]" />
  </div>;
}