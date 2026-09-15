/**
 * Sign-off chain shared between the KYC form and the command modules.
 *
 * The steps, their order and who may sign each are enforced in the database by
 * `record_signoff`; the labels here only describe what the officer sees.
 */

export const SIGNOFF_STEPS = [
  "staff_declaration",
  "checked_by",
  "recommended_by",
  "approved_by",
] as const;

export type SignOffStep = (typeof SIGNOFF_STEPS)[number];

export const SIGNOFF_STEP_LABEL: Record<string, string> = {
  staff_declaration: "Officer's declaration",
  checked_by: "Checked by",
  recommended_by: "Recommended by",
  approved_by: "Approved by",
  queried: "Queried",
  rejected: "Rejected",
};

export const SIGNOFF_STEP_HINT: Record<string, string> = {
  staff_declaration: "The officer confirms the record is true and complete.",
  checked_by: "A supervisor checks the entries against the documents.",
  recommended_by: "The commanding officer recommends the record for approval.",
  approved_by: "An administrator gives final approval.",
};

export const SIGNOFF_STEP_WHO: Record<string, string> = {
  staff_declaration: "The officer named on the record",
  checked_by: "Supervisor, staff officer or command tier",
  recommended_by: "OIC, 2IC, staff or command officer",
  approved_by: "Administrator",
};

export type SignOffStepState = {
  step: string;
  position: number;
  signed: boolean;
  note: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_role: string | null;
  signature_data: string | null;
  signature_hash: string | null;
  record_fingerprint: string | null;
  can_sign: boolean;
};

export type SignOffHistoryEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
  actor: string | null;
};

export type SignOffState = {
  entity_type: string;
  entity_id: string;
  steps: SignOffStepState[];
  history: SignOffHistoryEntry[];
  stage: string | null;
};

/** The step that is next in line, or null when the chain is complete. */
export function nextSignOffStep(steps: SignOffStepState[]): SignOffStepState | null {
  return steps.find((s) => !s.signed) ?? null;
}

export function signOffProgressLabel(steps: SignOffStepState[]) {
  const done = steps.filter((s) => s.signed).length;
  return `${done} of ${steps.length} signed`;
}
