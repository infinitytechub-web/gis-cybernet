import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { lazy, Suspense } from "react";

// Eagerly loaded (lightweight pages)
import Index from "./pages/Index";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import NotFound from "./pages/NotFound";

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
const Stores = lazy(() => import("./pages/Stores"));
const HoldingCenter = lazy(() => import("./pages/HoldingCenter"));
const Procurement = lazy(() => import("./pages/Procurement"));
const Misd = lazy(() => import("./pages/Misd"));
const Ipse = lazy(() => import("./pages/Ipse"));
const CommandVault = lazy(() => import("./pages/CommandVault"));
const RecycleBin = lazy(() => import("./pages/RecycleBin"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
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
          <Route path="/attendance" element={<ProtectedRoute><Layout><Attendance /></Layout></ProtectedRoute>} />
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
          <Route path="/stores" element={<ProtectedRoute><Layout><Stores /></Layout></ProtectedRoute>} />
          <Route path="/holding" element={<ProtectedRoute><Layout><HoldingCenter /></Layout></ProtectedRoute>} />
          <Route path="/procurement" element={<ProtectedRoute><Layout><Procurement /></Layout></ProtectedRoute>} />
          <Route path="/misd" element={<ProtectedRoute><Layout><Misd /></Layout></ProtectedRoute>} />
          <Route path="/ipse" element={<ProtectedRoute><Layout><Ipse /></Layout></ProtectedRoute>} />
          <Route path="/command-vault" element={<ProtectedRoute><Layout><CommandVault /></Layout></ProtectedRoute>} />
          <Route path="/recycle-bin" element={<ProtectedRoute><Layout><RecycleBin /></Layout></ProtectedRoute>} />
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
