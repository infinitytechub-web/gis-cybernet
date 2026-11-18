/** Reason categories offered for each leave type on the request form. */
export const LEAVE_REASONS: Record<string, string[]> = {
  annual: ["Annual vacation", "Family matters", "Travel", "Rest and recovery", "Other"],
  sick: ["Illness", "Hospital admission", "Medical appointment", "Post-treatment recovery", "Other"],
  maternity: ["Antenatal", "Delivery", "Postnatal care", "Other"],
  compassionate: ["Bereavement", "Family emergency", "Other"],
  study: ["Course or examination", "Training programme", "Other"],
  pass: ["Personal pass", "Official pass", "Other"],
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Annual Leave", sick: "Sick Leave", compassionate: "Compassionate Leave",
  pass: "Pass", study: "Study Leave", maternity: "Maternity Leave",
};

export function reasonsFor(type: string): string[] {
  return LEAVE_REASONS[type] ?? ["Other"];
}

/** Returns an error message, or null when the reason choice is valid. */
export function validateLeaveReason(type: string, category: string, details: string): string | null {
  if (!category) return "Please choose a reason";
  if (!reasonsFor(type).includes(category)) return "Choose a reason that matches the leave type";
  if (category === "Other" && !details.trim()) return "Please explain the reason when choosing Other";
  return null;
}
