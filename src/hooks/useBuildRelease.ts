import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_VERSION,
  BUILD_FINGERPRINT,
  BUILD_TIME,
  buildId,
  buildTooltip,
  setResolvedBuildRelease,
  type BuildRelease,
} from "@/lib/build-version";

/**
 * Registers this build with the backend (once per deployment) and resolves the
 * automatically generated version identifier: ITIDDMMYYYY-NN.
 *
 * Any signed-in user's first load after a deployment claims the next sequence
 * for the build date; every later load returns the same recorded release.
 */
export function useBuildRelease() {
  const query = useQuery({
    queryKey: ["app-build-release", BUILD_FINGERPRINT],
    queryFn: async (): Promise<BuildRelease | null> => {
      const { data, error } = await (supabase as any).rpc("register_app_build", {
        p_fingerprint: BUILD_FINGERPRINT,
        p_build_time: BUILD_TIME,
        p_app_version: APP_VERSION,
      });
      if (error) return null;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as BuildRelease) ?? null;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    if (query.data) setResolvedBuildRelease(query.data);
  }, [query.data]);

  return {
    release: query.data ?? null,
    versionId: query.data?.version_id ?? buildId(),
    tooltip: buildTooltip(),
    registered: Boolean(query.data),
    isLoading: query.isLoading,
  };
}
