import { supabase } from "@/integrations/supabase/client";

interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type: "leave" | "posting" | "shift" | "general";
  referenceId?: string;
}

export async function createNotification({
  userId,
  title,
  message,
  type,
  referenceId,
}: CreateNotificationParams) {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    title,
    message,
    type,
    reference_id: referenceId ?? null,
  });
  if (error) console.error("Failed to create notification:", error);
}

/** Look up a profile's linked auth user_id */
export async function getUserIdFromProfileId(profileId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("id", profileId)
    .maybeSingle();
  return data?.user_id ?? null;
}
