import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { lazy, Suspense } from "react";
import { useForcedSignoutWatcher } from "@/hooks/useForcedSignoutWatcher";

// Eagerly loaded (entry/LCP page only)
import Index from "./pages/Index";
import Login from "./pages/Login";

// Lazy-loaded (auth side-routes & error pages, rarely the entry)
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ForcePasswordChange = lazy(() => import("./pages/ForcePasswordChange"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));

// Lazy-loaded pages (contain heavy deps: recharts, jspdf, xlsx)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Staff = lazy(() => import("./pages/Staff"));
const StaffProfile = lazy(() => import("./pages/StaffProfile"));
const StaffDirectory = lazy(() => import("./pages/StaffDirectory"));
const Departments = lazy(() => import("./pages/Departments"));
const Roles = lazy(() => import("./pages/Roles"));
const Shifts = lazy(() => import("./pages/Shifts"));
const DutyRoster = lazy(() => import("./pages/DutyRoster"));
const Attendance = lazy(() => import("./pages/Attendance"));
const MyShiftTracker = lazy(() => import("./pages/MyShiftTracker"));
const StaffRequestApprovals = lazy(() => import("./pages/StaffRequestApprovals"));
const ShiftWindowAudit = lazy(() => import("./pages/ShiftWindowAudit"));
const SensitiveAccessLog = lazy(() => import("./pages/SensitiveAccessLog"));
const QuarantineInbox = lazy(() => import("./pages/QuarantineInbox"));
const IpBlocks = lazy(() => import("./pages/IpBlocks"));
const ShiftConnections = lazy(() => import("./pages/ShiftConnections"));
const LeaveRequests = lazy(() => import("./pages/LeaveRequests"));
const Holidays = lazy(() => import("./pages/Holidays"));
const PostingsTransfers = lazy(() => import("./pages/PostingsTransfers"));
const Compliance = lazy(() => import("./pages/Compliance"));
const Reports = lazy(() => import("./pages/Reports"));
const Announcements = lazy(() => import("./pages/Announcements"));
const FrontDesk = lazy(() => import("./pages/FrontDesk"));
const Processing = lazy(() => import("./pages/Processing"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Enforcement = lazy(() => import("./pages/Enforcement"));
const Operations = lazy(() => import("./pages/Operations"));
const Settings = lazy(() => import("./pages/Settings"));
const CommandRoles = lazy(() => import("./pages/CommandRoles"));
const AdminAccessMatrix = lazy(() => import("./pages/AdminAccessMatrix"));
const CommandRoleAudit = lazy(() => import("./pages/CommandRoleAudit"));
const Stores = lazy(() => import("./pages/Stores"));
const HoldingCenter = lazy(() => import("./pages/HoldingCenter"));
const Procurement = lazy(() => import("./pages/Procurement"));
const Misd = lazy(() => import("./pages/Misd"));
const Ipse = lazy(() => import("./pages/Ipse"));
const CommandVault = lazy(() => import("./pages/CommandVault"));
const RecycleBin = lazy(() => import("./pages/RecycleBin"));
const GpsAddresses = lazy(() => import("./pages/GpsAddresses"));
const Interlink = lazy(() => import("./pages/Interlink"));
const CommandsAdmin = lazy(() => import("./pages/CommandsAdmin"));
const CommandWorkspace = lazy(() => import("./pages/CommandWorkspace"));
const DutyRosterImport = lazy(() => import("./pages/DutyRosterImport"));
const GuardSchedule = lazy(() => import("./pages/GuardSchedule"));
const GuardScheduleImport = lazy(() => import("./pages/GuardScheduleImport"));
const RouteHistory = lazy(() => import("./pages/RouteHistory"));
const VerifyExport = lazy(() => import("./pages/VerifyExport"));
const PendingStaffApprovals = lazy(() => import("./pages/PendingStaffApprovals"));
const StaffAccountApprovals = lazy(() => import("./pages/StaffAccountApprovals"));
const HealthLab = lazy(() => import("./pages/HealthLab"));
const ExcuseDutyForm = lazy(() => import("./pages/ExcuseDutyForm"));
const MyExcuseDutySubmissions = lazy(() => import("./pages/MyExcuseDutySubmissions"));
const MyProfile = lazy(() => import("./pages/MyProfile"));
const Appraisals = lazy(() => import("./pages/Appraisals"));
const AppraisalCoverageReport = lazy(() => import("./pages/AppraisalCoverageReport"));
const AppraisalDetail = lazy(() => import("./pages/AppraisalDetail"));
const RoleAssignmentsAdmin = lazy(() => import("./pages/RoleAssignmentsAdmin"));
const StaffPortal = lazy(() => import("./pages/StaffPortal"));
const AuditLogDashboard = lazy(() => import("./pages/AuditLogDashboard"));
const StaffMappingImport = lazy(() => import("./pages/StaffMappingImport"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function ForcedSignoutMount() {
  useForcedSignoutWatcher();
  return null;
}

function App() {
  return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <ForcedSignoutMount />
        <IdleWarningDialog />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/change-password" element={<ProtectedRoute><ForcePasswordChange /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/staff" element={<ProtectedRoute><Layout><Staff /></Layout></ProtectedRoute>} />
          <Route path="/staff/:id" element={<ProtectedRoute><Layout><StaffProfile /></Layout></ProtectedRoute>} />
          <Route path="/directory" element={<ProtectedRoute><Layout><StaffDirectory /></Layout></ProtectedRoute>} />
          <Route path="/departments" element={<ProtectedRoute><Layout><Departments /></Layout></ProtectedRoute>} />
          <Route path="/roles" element={<ProtectedRoute><Layout><Roles /></Layout></ProtectedRoute>} />
          <Route path="/shifts" element={<ProtectedRoute><Layout><Shifts /></Layout></ProtectedRoute>} />
          <Route path="/roster" element={<ProtectedRoute><Layout><DutyRoster /></Layout></ProtectedRoute>} />
          <Route path="/roster/import" element={<ProtectedRoute><Layout><DutyRosterImport /></Layout></ProtectedRoute>} />
          <Route path="/guard-schedule" element={<ProtectedRoute><Layout><GuardSchedule /></Layout></ProtectedRoute>} />
          <Route path="/guard-schedule/import" element={<ProtectedRoute><Layout><GuardScheduleImport /></Layout></ProtectedRoute>} />
          <Route path="/route-history" element={<ProtectedRoute><Layout><RouteHistory /></Layout></ProtectedRoute>} />
          <Route path="/verify-export" element={<ProtectedRoute><Layout><VerifyExport /></Layout></ProtectedRoute>} />
          <Route path="/staff-approvals/pending" element={<ProtectedRoute><Layout><PendingStaffApprovals /></Layout></ProtectedRoute>} />
          <Route path="/staff-approvals/accounts" element={<ProtectedRoute><Layout><StaffAccountApprovals /></Layout></ProtectedRoute>} />
          <Route path="/attendance" element={<ProtectedRoute><Layout><Attendance /></Layout></ProtectedRoute>} />
          <Route path="/my-shift" element={<ProtectedRoute><Layout><MyShiftTracker /></Layout></ProtectedRoute>} />
          <Route path="/attendance/connections" element={<ProtectedRoute><Layout><ShiftConnections /></Layout></ProtectedRoute>} />
          <Route path="/staff-approvals" element={<ProtectedRoute><Layout><StaffRequestApprovals /></Layout></ProtectedRoute>} />
          <Route path="/shift-window-audit" element={<ProtectedRoute><Layout><ShiftWindowAudit /></Layout></ProtectedRoute>} />
          <Route path="/sensitive-access-log" element={<ProtectedRoute><Layout><SensitiveAccessLog /></Layout></ProtectedRoute>} />
          <Route path="/quarantine" element={<ProtectedRoute><Layout><QuarantineInbox /></Layout></ProtectedRoute>} />
          <Route path="/ip-blocks" element={<ProtectedRoute><Layout><IpBlocks /></Layout></ProtectedRoute>} />
          <Route path="/leave" element={<ProtectedRoute><Layout><LeaveRequests /></Layout></ProtectedRoute>} />
          <Route path="/holidays" element={<ProtectedRoute><Layout><Holidays /></Layout></ProtectedRoute>} />
          <Route path="/postings" element={<ProtectedRoute><Layout><PostingsTransfers /></Layout></ProtectedRoute>} />
          <Route path="/compliance" element={<ProtectedRoute><Layout><Compliance /></Layout></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Layout><Reports /></Layout></ProtectedRoute>} />
          <Route path="/announcements" element={<ProtectedRoute><Layout><Announcements /></Layout></ProtectedRoute>} />
          <Route path="/processing" element={<ProtectedRoute><Layout><Processing /></Layout></ProtectedRoute>} />
          <Route path="/front-desk" element={<ProtectedRoute><Layout><FrontDesk /></Layout></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
          <Route path="/enforcement" element={<ProtectedRoute><Layout><Enforcement /></Layout></ProtectedRoute>} />
          <Route path="/operations" element={<ProtectedRoute><Layout><Operations /></Layout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
          <Route path="/command-roles" element={<ProtectedRoute><Layout><CommandRoles /></Layout></ProtectedRoute>} />
          <Route path="/admin-access-matrix" element={<ProtectedRoute><Layout><AdminAccessMatrix /></Layout></ProtectedRoute>} />
          <Route path="/command-role-audit" element={<ProtectedRoute><Layout><CommandRoleAudit /></Layout></ProtectedRoute>} />
          <Route path="/stores" element={<ProtectedRoute><Layout><Stores /></Layout></ProtectedRoute>} />
          <Route path="/holding" element={<ProtectedRoute><Layout><HoldingCenter /></Layout></ProtectedRoute>} />
          <Route path="/procurement" element={<ProtectedRoute><Layout><Procurement /></Layout></ProtectedRoute>} />
          <Route path="/misd" element={<ProtectedRoute><Layout><Misd /></Layout></ProtectedRoute>} />
          <Route path="/ipse" element={<ProtectedRoute><Layout><Ipse /></Layout></ProtectedRoute>} />
          <Route path="/health-lab" element={<ProtectedRoute><Layout><HealthLab /></Layout></ProtectedRoute>} />
          <Route path="/excuse-duty" element={<ProtectedRoute><Layout><ExcuseDutyForm /></Layout></ProtectedRoute>} />
          <Route path="/excuse-duty/mine" element={<ProtectedRoute><Layout><MyExcuseDutySubmissions /></Layout></ProtectedRoute>} />
          <Route path="/my-profile" element={<ProtectedRoute><Layout><MyProfile /></Layout></ProtectedRoute>} />
          <Route path="/appraisals" element={<ProtectedRoute><Layout><Appraisals /></Layout></ProtectedRoute>} />
          <Route path="/appraisals/coverage" element={<ProtectedRoute><Layout><AppraisalCoverageReport /></Layout></ProtectedRoute>} />
          <Route path="/appraisals/officer/:staffProfileId" element={<ProtectedRoute><Layout><AppraisalDetail /></Layout></ProtectedRoute>} />

          <Route path="/role-assignments" element={<ProtectedRoute><Layout><RoleAssignmentsAdmin /></Layout></ProtectedRoute>} />
          <Route path="/staff-mapping-import" element={<ProtectedRoute><Layout><StaffMappingImport /></Layout></ProtectedRoute>} />
          <Route path="/my-portal" element={<ProtectedRoute><Layout><StaffPortal /></Layout></ProtectedRoute>} />
          <Route path="/audit-log" element={<ProtectedRoute><Layout><AuditLogDashboard /></Layout></ProtectedRoute>} />
          <Route path="/command-vault" element={<ProtectedRoute><Layout><CommandVault /></Layout></ProtectedRoute>} />
         <Route path="/command-vault/gps" element={<ProtectedRoute><Layout><GpsAddresses /></Layout></ProtectedRoute>} />
         {/* GPS Hub aliases — keep deep-links to the canonical command-vault path. */}
         <Route path="/gps-addresses" element={<Navigate to="/command-vault/gps" replace />} />
         <Route path="/gps-hub" element={<Navigate to="/command-vault/gps" replace />} />
          <Route path="/recycle-bin" element={<ProtectedRoute><Layout><RecycleBin /></Layout></ProtectedRoute>} />
          <Route path="/interlink" element={<ProtectedRoute><Layout><Interlink /></Layout></ProtectedRoute>} />
          <Route path="/commands" element={<ProtectedRoute><Layout><CommandsAdmin /></Layout></ProtectedRoute>} />
          <Route path="/command/:slug" element={<ProtectedRoute><Layout><CommandWorkspace /></Layout></ProtectedRoute>} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
  );
}

export default App;
