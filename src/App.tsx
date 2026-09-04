import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { BrandingProvider } from "@/components/BrandingProvider";
import { lazy, Suspense } from "react";
// Layout is lazy — it pulls in the authenticated app shell (sidebar,
// SystemAuditTray, notification bell, etc.) and its transitive deps. The
// login page must not pay that cost.
const Layout = lazy(() => import("@/components/Layout").then(m => ({ default: m.Layout })));
import { useForcedSignoutWatcher } from "@/hooks/useForcedSignoutWatcher";
import { useSessionRegistry } from "@/hooks/useSessionRegistry";
import { useAuth } from "@/hooks/useAuth";
// IdleWarningDialog pulls in Radix AlertDialog + Progress. Defer it until a
// user is actually signed in — the unauthenticated /login route never needs it.
const IdleWarningDialog = lazy(() =>
  import("@/components/IdleWarningDialog").then(m => ({ default: m.IdleWarningDialog }))
);
const BiometricEnrollmentGate = lazy(() =>
  import("@/components/security/BiometricEnrollmentGate").then(m => ({ default: m.BiometricEnrollmentGate }))
);

// Eagerly loaded (entry/LCP page only)
import Index from "./pages/Index";
import Login from "./pages/Login";

// Lazy-loaded (auth side-routes & error pages, rarely the entry)
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AdminRecovery = lazy(() => import("./pages/AdminRecovery"));
const ForcePasswordChange = lazy(() => import("./pages/ForcePasswordChange"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));

// Lazy-loaded pages (contain heavy deps: recharts, jspdf, xlsx)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Staff = lazy(() => import("./pages/Staff"));
const StaffProfile = lazy(() => import("./pages/StaffProfile"));
const StaffDirectory = lazy(() => import("./pages/StaffDirectory"));
const StaffExportIntegrity = lazy(() => import("./pages/StaffExportIntegrity"));
const Departments = lazy(() => import("./pages/Departments"));
const Roles = lazy(() => import("./pages/Roles"));
const OrgStructure = lazy(() => import("./pages/OrgStructure"));
// Monitoring & Evaluation — one screen resolves each /me/* module by path.
const MEPage = lazy(() => import("./pages/me/MEPage"));
const UnitDashboard = lazy(() => import("./pages/UnitDashboard"));
const SessionManagement = lazy(() => import("./pages/SessionManagement"));
const TrustedDevices = lazy(() => import("./pages/TrustedDevices"));
const Shifts = lazy(() => import("./pages/Shifts"));
const DutyRoster = lazy(() => import("./pages/DutyRoster"));
const Attendance = lazy(() => import("./pages/Attendance"));
const MyShiftTracker = lazy(() => import("./pages/MyShiftTracker"));
const StaffRequestApprovals = lazy(() => import("./pages/StaffRequestApprovals"));
const ShiftWindowAudit = lazy(() => import("./pages/ShiftWindowAudit"));
const SensitiveAccessLog = lazy(() => import("./pages/SensitiveAccessLog"));
const SecurityAuditLog = lazy(() => import("./pages/SecurityAuditLog"));
const SecurityMonitoring = lazy(() => import("./pages/SecurityMonitoring"));
const PhoneValidationRules = lazy(() => import("./pages/PhoneValidationRules"));
const QuarantineInbox = lazy(() => import("./pages/QuarantineInbox"));
const IpBlocks = lazy(() => import("./pages/IpBlocks"));
const ShiftConnections = lazy(() => import("./pages/ShiftConnections"));
const LeaveRequests = lazy(() => import("./pages/LeaveRequests"));
const Payments = lazy(() => import("./pages/Payments"));
const Loans = lazy(() => import("./pages/Loans"));
const Holidays = lazy(() => import("./pages/Holidays"));
const PostingsTransfers = lazy(() => import("./pages/PostingsTransfers"));
const PostingsHistory = lazy(() => import("./pages/PostingsHistory"));
const Compliance = lazy(() => import("./pages/Compliance"));
const Reports = lazy(() => import("./pages/Reports"));
const Announcements = lazy(() => import("./pages/Announcements"));
const ScheduledFiles = lazy(() => import("./pages/ScheduledFiles"));
const FrontDesk = lazy(() => import("./pages/FrontDesk"));
const Processing = lazy(() => import("./pages/Processing"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Enforcement = lazy(() => import("./pages/Enforcement"));
const Operations = lazy(() => import("./pages/Operations"));
const Settings = lazy(() => import("./pages/Settings"));
const Branding = lazy(() => import("./pages/Branding"));
const CommandRoles = lazy(() => import("./pages/CommandRoles"));
const AdminConsole = lazy(() => import("./pages/AdminConsole"));
const AdminAccessMatrix = lazy(() => import("./pages/AdminAccessMatrix"));
const CommandRoleAudit = lazy(() => import("./pages/CommandRoleAudit"));
const Stores = lazy(() => import("./pages/Stores"));
const Fleet = lazy(() => import("./pages/Fleet"));
const InCab = lazy(() => import("./pages/InCab"));
const CommandConsole = lazy(() => import("./pages/CommandConsole"));

const HoldingCenter = lazy(() => import("./pages/HoldingCenter"));
const Procurement = lazy(() => import("./pages/Procurement"));
const Misd = lazy(() => import("./pages/Misd"));
const Ipse = lazy(() => import("./pages/Ipse"));
const CommandVault = lazy(() => import("./pages/CommandVault"));
const RecycleBin = lazy(() => import("./pages/RecycleBin"));
const RetentionPolicy = lazy(() => import("./pages/RetentionPolicy"));
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
const BiometricEnrollment = lazy(() => import("./pages/BiometricEnrollment"));
const Appraisals = lazy(() => import("./pages/Appraisals"));
const AppraisalCoverageReport = lazy(() => import("./pages/AppraisalCoverageReport"));
const AppraisalDetail = lazy(() => import("./pages/AppraisalDetail"));
const RoleAssignmentsAdmin = lazy(() => import("./pages/RoleAssignmentsAdmin"));
const StaffPortal = lazy(() => import("./pages/StaffPortal"));
const AuditLogDashboard = lazy(() => import("./pages/AuditLogDashboard"));
const StaffMappingImport = lazy(() => import("./pages/StaffMappingImport"));
const BioDataFormSetup = lazy(() => import("./pages/BioDataFormSetup"));

const ProfileChangeApprovals = lazy(() => import("./pages/ProfileChangeApprovals"));
const MfaGate = lazy(() => import("./pages/MfaGate"));
const RotationChangeApprovals = lazy(() => import("./pages/RotationChangeApprovals"));
const AdminShiftRotations = lazy(() => import("./pages/AdminShiftRotations"));
const RumAnalytics = lazy(() => import("./pages/RumAnalytics"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div
      className="flex items-center justify-center min-h-[50vh]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}

function ForcedSignoutMount() {
  useForcedSignoutWatcher();
  useSessionRegistry();
  return null;
}

/** Mount idle-timeout dialog and biometric enrollment prompt when signed in. */
function AuthenticatedExtras() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Suspense fallback={null}>
      <IdleWarningDialog />
      <BiometricEnrollmentGate />
    </Suspense>
  );
}

function App() {
  return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <TooltipProvider>
      <BrandingProvider />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <ForcedSignoutMount />
        <AuthenticatedExtras />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/admin-recovery" element={<AdminRecovery />} />
          <Route path="/change-password" element={<ProtectedRoute module="change-password"><ForcePasswordChange /></ProtectedRoute>} />
          <Route path="/2fa" element={<MfaGate />} />
          <Route path="/dashboard" element={<ProtectedRoute module="dashboard"><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/staff" element={<ProtectedRoute module="staff"><Layout><Staff /></Layout></ProtectedRoute>} />
          <Route path="/staff/:id" element={<ProtectedRoute module="staff"><Layout><StaffProfile /></Layout></ProtectedRoute>} />
          <Route path="/directory" element={<ProtectedRoute module="staff-directory"><Layout><StaffDirectory /></Layout></ProtectedRoute>} />
          <Route path="/departments" element={<ProtectedRoute module="departments"><Layout><Departments /></Layout></ProtectedRoute>} />

          <Route path="/roles" element={<ProtectedRoute module="roles-designations"><Layout><Roles /></Layout></ProtectedRoute>} />
          <Route path="/shifts" element={<ProtectedRoute module="shifts"><Layout><Shifts /></Layout></ProtectedRoute>} />
          <Route path="/roster" element={<ProtectedRoute module="roster"><Layout><DutyRoster /></Layout></ProtectedRoute>} />
          <Route path="/roster/import" element={<ProtectedRoute module="roster-import"><Layout><DutyRosterImport /></Layout></ProtectedRoute>} />
          <Route path="/guard-schedule" element={<ProtectedRoute module="guard-schedule"><Layout><GuardSchedule /></Layout></ProtectedRoute>} />
          <Route path="/guard-schedule/import" element={<ProtectedRoute module="guard-schedule-import"><Layout><GuardScheduleImport /></Layout></ProtectedRoute>} />
          <Route path="/route-history" element={<ProtectedRoute module="route-history"><Layout><RouteHistory /></Layout></ProtectedRoute>} />
          <Route path="/verify-export" element={<ProtectedRoute module="verify-export"><Layout><VerifyExport /></Layout></ProtectedRoute>} />
          <Route path="/staff-export-integrity" element={<ProtectedRoute module="staff-export-integrity"><Layout><StaffExportIntegrity /></Layout></ProtectedRoute>} />

          <Route path="/staff-approvals/pending" element={<ProtectedRoute module="staff-approvals-pending"><Layout><PendingStaffApprovals /></Layout></ProtectedRoute>} />
          <Route path="/staff-approvals/accounts" element={<ProtectedRoute module="staff_admin"><Layout><StaffAccountApprovals /></Layout></ProtectedRoute>} />
          <Route path="/staff-approvals/profile-changes" element={<ProtectedRoute module="profile-change-approvals"><Layout><ProfileChangeApprovals /></Layout></ProtectedRoute>} />
          <Route path="/attendance" element={<ProtectedRoute module="attendance"><Layout><Attendance /></Layout></ProtectedRoute>} />
          <Route path="/my-shift" element={<ProtectedRoute module="my-shift"><Layout><MyShiftTracker /></Layout></ProtectedRoute>} />
          <Route path="/shift-rotation-approvals" element={<ProtectedRoute module="shift-rotation-approvals"><Layout><RotationChangeApprovals /></Layout></ProtectedRoute>} />
          <Route path="/attendance/connections" element={<ProtectedRoute module="shift-connections"><Layout><ShiftConnections /></Layout></ProtectedRoute>} />
          <Route path="/staff-approvals" element={<ProtectedRoute module="staff-request-approvals"><Layout><StaffRequestApprovals /></Layout></ProtectedRoute>} />
          <Route path="/shift-window-audit" element={<ProtectedRoute module="shift-window-audit"><Layout><ShiftWindowAudit /></Layout></ProtectedRoute>} />
          <Route path="/security-monitoring" element={<ProtectedRoute module="security-monitoring"><Layout><SecurityMonitoring /></Layout></ProtectedRoute>} />
          <Route path="/security-audit-log" element={<ProtectedRoute module="security-audit-log"><Layout><SecurityAuditLog /></Layout></ProtectedRoute>} />
          <Route path="/admin/phone-validation" element={<ProtectedRoute module="phone-validation-rules"><Layout><PhoneValidationRules /></Layout></ProtectedRoute>} />
          <Route path="/sensitive-access-log" element={<ProtectedRoute module="sensitive-access-log"><Layout><SensitiveAccessLog /></Layout></ProtectedRoute>} />
          <Route path="/quarantine" element={<ProtectedRoute module="quarantine"><Layout><QuarantineInbox /></Layout></ProtectedRoute>} />
          <Route path="/ip-blocks" element={<ProtectedRoute module="ip-blocks"><Layout><IpBlocks /></Layout></ProtectedRoute>} />
          <Route path="/leave" element={<ProtectedRoute module="leave"><Layout><LeaveRequests /></Layout></ProtectedRoute>} />
          <Route path="/payments" element={<ProtectedRoute module="payments"><Layout><Payments /></Layout></ProtectedRoute>} />
          <Route path="/loans" element={<ProtectedRoute module="loans"><Layout><Loans /></Layout></ProtectedRoute>} />
          <Route path="/holidays" element={<ProtectedRoute module="holidays"><Layout><Holidays /></Layout></ProtectedRoute>} />
          <Route path="/postings" element={<ProtectedRoute module="postings"><Layout><PostingsTransfers /></Layout></ProtectedRoute>} />
          <Route path="/postings/history" element={<ProtectedRoute module="postings"><Layout><PostingsHistory /></Layout></ProtectedRoute>} />
          <Route path="/compliance" element={<ProtectedRoute module="compliance"><Layout><Compliance /></Layout></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute module="reports"><Layout><Reports /></Layout></ProtectedRoute>} />
          <Route path="/announcements" element={<ProtectedRoute module="announcements"><Layout><Announcements /></Layout></ProtectedRoute>} />
          <Route path="/scheduled-files" element={<ProtectedRoute module="scheduled-files"><Layout><ScheduledFiles /></Layout></ProtectedRoute>} />
          <Route path="/processing" element={<ProtectedRoute module="processing"><Layout><Processing /></Layout></ProtectedRoute>} />
          <Route path="/front-desk" element={<ProtectedRoute module="front-desk"><Layout><FrontDesk /></Layout></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute module="analytics"><Layout><Analytics /></Layout></ProtectedRoute>} />
          <Route path="/enforcement" element={<ProtectedRoute module="enforcement"><Layout><Enforcement /></Layout></ProtectedRoute>} />
          <Route path="/operations" element={<ProtectedRoute module="operations"><Layout><Operations /></Layout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute module="settings"><Layout><Settings /></Layout></ProtectedRoute>} />
          <Route path="/branding" element={<ProtectedRoute module="branding"><Layout><Branding /></Layout></ProtectedRoute>} />
          <Route path="/admin/shift-rotations" element={<ProtectedRoute module="admin-shift-rotations"><Layout><AdminShiftRotations /></Layout></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute module="admin-console"><Layout><AdminConsole /></Layout></ProtectedRoute>} />
          <Route path="/command-roles" element={<ProtectedRoute module="command-roles"><Layout><CommandRoles /></Layout></ProtectedRoute>} />
          <Route path="/admin-access-matrix" element={<ProtectedRoute module="admin-access-matrix"><Layout><AdminAccessMatrix /></Layout></ProtectedRoute>} />
          <Route path="/command-role-audit" element={<ProtectedRoute module="command-role-audit"><Layout><CommandRoleAudit /></Layout></ProtectedRoute>} />
          <Route path="/stores" element={<ProtectedRoute module="stores"><Layout><Stores /></Layout></ProtectedRoute>} />
          <Route path="/fleet" element={<ProtectedRoute module="fleet"><Layout><Fleet /></Layout></ProtectedRoute>} />
          <Route path="/in-cab" element={<ProtectedRoute module="in-cab"><Layout><InCab /></Layout></ProtectedRoute>} />
          <Route path="/command-console" element={<ProtectedRoute module="command-console"><Layout><CommandConsole /></Layout></ProtectedRoute>} />

          <Route path="/holding" element={<ProtectedRoute module="detention"><Layout><HoldingCenter /></Layout></ProtectedRoute>} />
          <Route path="/procurement" element={<ProtectedRoute module="procurement"><Layout><Procurement /></Layout></ProtectedRoute>} />
          <Route path="/misd" element={<ProtectedRoute module="misd"><Layout><Misd /></Layout></ProtectedRoute>} />
          <Route path="/ipse" element={<ProtectedRoute module="ipse"><Layout><Ipse /></Layout></ProtectedRoute>} />
          <Route path="/health-lab" element={<ProtectedRoute module="health-lab"><Layout><HealthLab /></Layout></ProtectedRoute>} />
          <Route path="/excuse-duty" element={<ProtectedRoute module="excuse-duty"><Layout><ExcuseDutyForm /></Layout></ProtectedRoute>} />
          <Route path="/excuse-duty/mine" element={<ProtectedRoute module="excuse-duty"><Layout><MyExcuseDutySubmissions /></Layout></ProtectedRoute>} />
          <Route path="/my-profile" element={<ProtectedRoute module="my-profile"><Layout><MyProfile /></Layout></ProtectedRoute>} />
          <Route path="/biometric-enrollment" element={<ProtectedRoute module="biometric-enrollment"><Layout><BiometricEnrollment /></Layout></ProtectedRoute>} />
          <Route path="/appraisals" element={<ProtectedRoute module="appraisals"><Layout><Appraisals /></Layout></ProtectedRoute>} />
          <Route path="/appraisals/coverage" element={<ProtectedRoute module="appraisal-coverage"><Layout><AppraisalCoverageReport /></Layout></ProtectedRoute>} />
          <Route path="/appraisals/officer/:staffProfileId" element={<ProtectedRoute module="appraisals"><Layout><AppraisalDetail /></Layout></ProtectedRoute>} />

          <Route path="/role-assignments" element={<ProtectedRoute module="role-assignments"><Layout><RoleAssignmentsAdmin /></Layout></ProtectedRoute>} />
          <Route path="/staff-mapping-import" element={<ProtectedRoute module="staff-mapping-import"><Layout><StaffMappingImport /></Layout></ProtectedRoute>} />
          <Route path="/biodata-form-setup" element={<ProtectedRoute module="biodata-form-setup"><Layout><BioDataFormSetup /></Layout></ProtectedRoute>} />

          <Route path="/my-portal" element={<ProtectedRoute module="my-portal"><Layout><StaffPortal /></Layout></ProtectedRoute>} />
          <Route path="/audit-log" element={<ProtectedRoute module="audit-log"><Layout><AuditLogDashboard /></Layout></ProtectedRoute>} />
          <Route path="/rum-analytics" element={<ProtectedRoute module="rum-analytics"><Layout><RumAnalytics /></Layout></ProtectedRoute>} />
          <Route path="/command-vault" element={<ProtectedRoute module="command-vault"><Layout><CommandVault /></Layout></ProtectedRoute>} />
         <Route path="/command-vault/gps" element={<ProtectedRoute module="command-vault"><Layout><GpsAddresses /></Layout></ProtectedRoute>} />
         {/* GPS Hub aliases — keep deep-links to the canonical command-vault path. */}
         <Route path="/gps-addresses" element={<Navigate to="/command-vault/gps" replace />} />
         <Route path="/gps-hub" element={<Navigate to="/command-vault/gps" replace />} />
          <Route path="/recycle-bin" element={<ProtectedRoute module="recycle-bin"><Layout><RecycleBin /></Layout></ProtectedRoute>} />
          <Route path="/announcements/retention" element={<ProtectedRoute module="retention-policy"><Layout><RetentionPolicy /></Layout></ProtectedRoute>} />
          <Route path="/interlink" element={<ProtectedRoute module="interlink"><Layout><Interlink /></Layout></ProtectedRoute>} />
          <Route path="/admin/sessions" element={<ProtectedRoute module="session-management"><Layout><SessionManagement /></Layout></ProtectedRoute>} />
          <Route path="/admin/trusted-devices" element={<ProtectedRoute module="trusted-devices"><Layout><TrustedDevices /></Layout></ProtectedRoute>} />
          <Route path="/unit-dashboard" element={<ProtectedRoute module="unit-dashboard"><Layout><UnitDashboard /></Layout></ProtectedRoute>} />
          <Route path="/org-structure" element={<ProtectedRoute module="org-structure"><Layout><OrgStructure /></Layout></ProtectedRoute>} />

          {/* Monitoring, Evaluation, Project & Performance Management */}
          <Route path="/me" element={<Navigate to="/me/command-center" replace />} />
          {[
            ["command-center", "me-command-center"],
            ["objectives", "me-objectives"],
            ["programs", "me-programs"],
            ["projects", "me-projects"],
            ["workplans", "me-workplans"],
            ["measures", "me-measures"],
            ["results", "me-results"],
            ["field-reports", "me-field-reports"],
            ["gis-map", "me-gis-map"],
            ["risks", "me-risks"],
            ["incidents", "me-incidents"],
            ["actions", "me-actions"],
            ["resources", "me-resources"],
            ["budgets", "me-budgets"],
            ["evidence", "me-evidence"],
            ["approvals", "me-approvals"],
            ["reports", "me-reports"],
            ["analytics", "me-analytics"],
            ["audit", "me-audit"],
            ["administration", "me-administration"],
          ].map(([segment, moduleKey]) => (
            <Route
              key={segment}
              path={`/me/${segment}`}
              element={<ProtectedRoute module={moduleKey}><Layout><MEPage /></Layout></ProtectedRoute>}
            />
          ))}
          <Route path="/commands" element={<ProtectedRoute module="commands"><Layout><CommandsAdmin /></Layout></ProtectedRoute>} />
          <Route path="/command/:slug" element={<ProtectedRoute module="commands"><Layout><CommandWorkspace /></Layout></ProtectedRoute>} />
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
