import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/** Resolve a deep link through caller-scoped reads, not the currently filtered list. */
export function useHoldingRecordLink(allowed: boolean) {
  const [params, setParams] = useSearchParams();
  const id = params.get("record");
  const query = useQuery({
    queryKey: ["detention-linked-record", id],
    enabled: allowed && !!id,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("detention_records").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This record is unavailable or you do not have access.");
      return data;
    },
  });
  const close = () => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.delete("record"); next.delete("edit");
    return next;
  }, { replace: true });
  return { ...query, requested: allowed && !!id, edit: params.get("edit") === "1", close };
}