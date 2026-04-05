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

export type AppRole = "admin" | "supervisor" | "staff";

export interface ProfileWithRelations extends Profile {
  ranks?: Rank | null;
  departments?: Department | null;
}
