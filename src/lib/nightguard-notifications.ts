import { supabase } from "@/integrations/supabase/client";

const motivationalMessages = [
  "Your dedication to protecting the community is truly inspiring. Stay vigilant and safe! 🛡️",
  "Thank you for standing guard tonight. Your commitment keeps everyone safe! 💪",
  "Another night of service — your courage and sacrifice are deeply valued! 🌙",
  "Heroes don't always wear capes. Tonight, you're our hero on duty! ⭐",
  "Your presence brings safety and peace of mind. Keep up the outstanding work! 🔐",
];

function getMotivationalMessage(): string {
  return motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
}

/**
 * Send motivational notifications to OIC, 2IC, and shift supervisors
 * when a night guard staff reports for duty.
 */
export async function notifySupervisorsOfGuardLogin(
  guardName: string,
  guardStaffId: string
) {
  try {
    // Get all users with supervisor-level roles who should be notified
    const rolesToNotify = ["oic", "2ic", "shift_supervisor", "deputy_shift_supervisor", "supervisor"];

    const { data: roleUsers, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", rolesToNotify);

    if (roleError || !roleUsers || roleUsers.length === 0) return;

    // Deduplicate by user_id
    const uniqueUserIds = [...new Set(roleUsers.map((r) => r.user_id))];

    const motivationalMsg = getMotivationalMessage();

    const notifications = uniqueUserIds.map((userId) => ({
      user_id: userId,
      title: `🛡️ ${guardName} reported for Night Guard Duty`,
      message: `${guardName} (${guardStaffId}) has logged in for night guard duty. ${motivationalMsg}`,
      type: "shift",
    }));

    // Insert in batches to avoid hitting limits
    const batchSize = 50;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      await supabase.from("notifications").insert(batch);
    }
  } catch (err) {
    console.error("Failed to notify supervisors of guard login:", err);
  }
}
