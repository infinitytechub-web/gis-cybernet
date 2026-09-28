import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const cmToFtIn = (cm: number) => {
  const totalIn = Math.round(cm / 2.54);
  return `${Math.floor(totalIn / 12)} ft ${totalIn % 12} in`;
};

export function useHeightRange() {
  return useQuery({
    queryKey: ["height-range"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("height_min_cm, height_max_cm").limit(1).maybeSingle();
      return { min: (data as any)?.height_min_cm ?? 120, max: (data as any)?.height_max_cm ?? 230 };
    },
  }).data ?? { min: 120, max: 230 };
}

/** Standard human-height selector in cm with ft/in equivalent. */
export function HeightPicker({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const { min, max } = useHeightRange();
  const opts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const n = Number(value);
  const outOfRange = value !== "" && (Number.isNaN(n) || n < min || n > max);
  return (
    <div className="space-y-1">
      <Select value={outOfRange ? "" : value} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue placeholder={`Select height (${min}–${max} cm)`} /></SelectTrigger>
        <SelectContent className="max-h-[260px]">
          {opts.map((cm) => (
            <SelectItem key={cm} value={String(cm)}>{cm} cm · {cmToFtIn(cm)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground">
        {value && !outOfRange ? `≈ ${cmToFtIn(n)}` : outOfRange ? `Saved value ${value} cm is outside ${min}–${max} cm — please reselect.` : "Choose a height; feet/inches shown automatically."}
      </p>
    </div>
  );
}
