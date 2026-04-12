import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AppSettings {
  org_name: string;
  system_label: string;
  auto_logout_minutes: number;
  enforce_password_change: boolean;
  min_password_length: number;
  allow_self_registration: boolean;
}

const defaults: AppSettings = {
  org_name: "GIS Amasaman Sector Command",
  system_label: "Cybernet",
  auto_logout_minutes: 30,
  enforce_password_change: true,
  min_password_length: 8,
  allow_self_registration: false,
};

export function useAppSettings() {
  const { data } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data as AppSettings;
    },
    staleTime: 5 * 60 * 1000,
  });

  return data ?? defaults;
}
