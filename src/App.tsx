import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Staff from "./pages/Staff";
import Departments from "./pages/Departments";
import Roles from "./pages/Roles";
import Shifts from "./pages/Shifts";
import DutyRoster from "./pages/DutyRoster";
import Attendance from "./pages/Attendance";
import LeaveRequests from "./pages/LeaveRequests";
import Holidays from "./pages/Holidays";
import PostingsTransfers from "./pages/PostingsTransfers";
import Compliance from "./pages/Compliance";
import Reports from "./pages/Reports";
import StaffProfile from "./pages/StaffProfile";
import StaffDirectory from "./pages/StaffDirectory";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
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
          <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
