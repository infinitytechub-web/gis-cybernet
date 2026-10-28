import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

/** Searchable multi-select of offences with "+" to add an unlisted offence. */
export function OffencesMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["offence_catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase.from("offence_catalogue").select("name").order("name");
      if (error) throw error;
      return data.map((r) => r.name);
    },
  });
  const term = q.trim();
  const matches = data.filter((n) => n.toLowerCase().includes(term.toLowerCase()) && !value.includes(n));
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  const addOther = async () => {
    if (!term || value.some((v) => v.toLowerCase() === term.toLowerCase())) return;
    onChange([...value, term]);
    setQ("");
    if (!data.some((n) => n.toLowerCase() === term.toLowerCase())) {
      await supabase.from("offence_catalogue").insert({ name: term, approved: false });
      qc.invalidateQueries({ queryKey: ["offence_catalogue"] });
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => toggle(v)}><X className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Search offences or type Others…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); matches[0] ? toggle(matches[0]) : addOther(); } }} />
        <Button type="button" size="icon" variant="outline" aria-label="Add offence manually" onClick={addOther} disabled={!term}><Plus className="h-4 w-4" /></Button>
      </div>
      {term || matches.length ? (
        <div className="max-h-40 overflow-y-auto rounded-md border">
          {matches.slice(0, 30).map((n) => (
            <button type="button" key={n} onClick={() => toggle(n)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted">{n}</button>
          ))}
          {term && !matches.length && <button type="button" onClick={addOther} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted">Others: add “{term}”</button>}
        </div>
      ) : null}
    </div>
  );
}
