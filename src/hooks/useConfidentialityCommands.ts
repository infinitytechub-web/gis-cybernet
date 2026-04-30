import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConfidentialityCommand = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pinned: boolean;
  sort_hint: number;
  created_at: string;
  updated_at: string;
};

export function useConfidentialityCommands() {
  return useQuery({
    queryKey: ["confidentiality-commands"],
    queryFn: async (): Promise<ConfidentialityCommand[]> => {
      const { data, error } = await supabase
        .from("confidentiality_commands" as any)
        .select("*");
      if (error) throw error;
      const rows = (data ?? []) as unknown as ConfidentialityCommand[];
      // Pinned first (in original sort_hint/name order), then alphabetical for the rest.
      const pinned = rows.filter((r) => r.pinned)
        .sort((a, b) => a.sort_hint - b.sort_hint || a.name.localeCompare(b.name));
      const rest = rows.filter((r) => !r.pinned)
        .sort((a, b) => a.name.localeCompare(b.name));
      return [...pinned, ...rest];
    },
  });
}
