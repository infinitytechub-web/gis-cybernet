import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type Rank = Tables<"ranks">;
export type Department = Tables<"departments">;
export type Shift = Tables<"shifts">;
export type ShiftAssignment = Tables<"shift_assignments">;
export type Attendance = Tables<"attendances">;
export type LeaveRequest = Tables<"leave_requests">;
export type Holiday = Tables<"holidays">;
export type PostingTransfer = Tables<"postings_transfers">;
export type UserRole = Tables<"user_roles">;

export type AppRole =
  | "admin"
  | "oic"
  | "2ic"
  | "head_of_administration"
  | "chief_staff_officer"
  | "command_officer"
  | "me_officer"
  | "project_manager"
  | "field_officer"
  | "head_of_processing"
  | "deputy_head_of_processing"
  | "staff_officer"
  | "supervisor"
  | "ipse_supervisor"
  | "ipse_deputy_supervisor"
  | "shift_supervisor"
  | "deputy_shift_supervisor"
  | "shift_leader"
  | "deputy_supervisor"
  | "deputy_shift_leader"
  | "special_duties"
  | "deputy"
  | "front_desk"
  | "official"
  | "enquiry"
  | "storekeeper"
  | "procurement_officer"
  | "medical_officer"
  | "staff";

export type ReportSeverity = "low" | "medium" | "high";
export type IpseStatus =
  | "pending_ipse"
  | "forwarded_to_2ic"
  | "forwarded_to_oic"
  | "approved"
  | "rejected";

export interface ProfileWithRelations extends Profile {
  ranks?: Rank | null;
  departments?: Department | null;
}
