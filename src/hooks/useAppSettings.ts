import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_STAFF_ID_MASK_RULES,
  normalizeStaffIdMaskRules,
  type StaffIdMaskRules,
} from "@/lib/staff-id-mask";

interface AppSettings {
  org_name: string;
  system_label: string;
  auto_logout_minutes: number;
  enforce_password_change: boolean;
  min_password_length: number;
  allow_self_registration: boolean;
  staff_id_mask_rules: StaffIdMaskRules;
}

const defaults: AppSettings = {
  org_name: "Cybernet HRM System",
  system_label: "Cybernet",
  auto_logout_minutes: 30,
  enforce_password_change: true,
  min_password_length: 8,
  allow_self_registration: false,
  staff_id_mask_rules: DEFAULT_STAFF_ID_MASK_RULES,
};

export function useAppSettings() {
  const { data } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      // Use the safe RPC that returns only UI-relevant fields to all
      // authenticated users (full table is restricted to command tier).
      const { data, error } = await (supabase as any).rpc("get_public_app_settings");
      if (error || !data) return defaults;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return defaults;
      return {
        ...defaults,
        ...(row as AppSettings),
        staff_id_mask_rules: normalizeStaffIdMaskRules((row as any).staff_id_mask_rules),
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return data ?? defaults;
}
