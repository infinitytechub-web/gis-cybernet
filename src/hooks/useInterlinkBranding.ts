import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { INTERLINK_LABELS } from "@/lib/interlink-types";

/**
 * Reads the singleton `interlink_branding` row.
 * Falls back to the hardcoded defaults in INTERLINK_LABELS if the row is
 * missing, the request fails, or the user is unauthenticated.
 */
export function useInterlinkBranding() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["interlink-branding"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_branding")
        .select("title, tagline")
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  // Realtime — push updates to all open browsers immediately
  useEffect(() => {
    const ch = supabase
      .channel(`interlink-branding-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "interlink_branding" },
        () => qc.invalidateQueries({ queryKey: ["interlink-branding"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return {
    title: data?.title?.trim() || INTERLINK_LABELS.title,
    tagline: data?.tagline?.trim() || INTERLINK_LABELS.tagline,
    nav: data?.title?.trim() || INTERLINK_LABELS.nav,
  };
}
