import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { INTERLINK_LABELS } from "@/lib/interlink-types";

/**
 * Reads the singleton `interlink_branding` row.
 * Falls back to the hardcoded defaults in INTERLINK_LABELS if the row is
 * missing, the request fails, or the user is unauthenticated.
 *
 * Deliberately no Realtime subscription: the table is not part of the
 * publication (Realtime cannot scope topic access per role), so updates are
 * picked up on mount / window focus instead.
 */
export function useInterlinkBranding() {
  const { data } = useQuery({
    queryKey: ["interlink-branding"],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_branding")
        .select("title, tagline")
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  return {
    title: data?.title?.trim() || INTERLINK_LABELS.title,
    tagline: data?.tagline?.trim() || INTERLINK_LABELS.tagline,
    nav: data?.title?.trim() || INTERLINK_LABELS.nav,
  };
}
