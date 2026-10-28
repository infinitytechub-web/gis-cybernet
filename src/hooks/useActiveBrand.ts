import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppBrand } from "@/lib/brands";

export function useBrands() {
  const qc = useQueryClient();
  const id = useId();
  const q = useQuery({
    queryKey: ["app-brands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_brands").select("id,name,tokens,is_active,is_system").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as AppBrand[];
    },
    staleTime: 60_000,
  });
  useEffect(() => {
    const ch = supabase.channel(`app-brands-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_brands" }, () => qc.invalidateQueries({ queryKey: ["app-brands"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, id]);
  return q;
}
