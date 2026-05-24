import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export type ApplicantCategory = "all" | "ecowas" | "non_ecowas";

export function categoryBadge(cat?: string | null) {
  if (cat === "ecowas") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">⭐ ECOWAS</Badge>;
  if (cat === "non_ecowas") return <Badge className="bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200">Non-ECOWAS</Badge>;
  return null;
}

interface Props {
  value: ApplicantCategory;
  onChange: (v: ApplicantCategory) => void;
  counts?: { ecowas: number; non_ecowas: number; all: number };
}

export function CategoryTabs({ value, onChange, counts }: Props) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ApplicantCategory)}>
      <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
        <TabsTrigger value="all" className="text-xs sm:text-sm">
          All {counts ? <span className="ml-1 opacity-60">({counts.all})</span> : null}
        </TabsTrigger>
        <TabsTrigger value="ecowas" className="text-xs sm:text-sm">
          ⭐ ECOWAS {counts ? <span className="ml-1 opacity-60">({counts.ecowas})</span> : null}
        </TabsTrigger>
        <TabsTrigger value="non_ecowas" className="text-xs sm:text-sm">
          Non-ECOWAS {counts ? <span className="ml-1 opacity-60">({counts.non_ecowas})</span> : null}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
