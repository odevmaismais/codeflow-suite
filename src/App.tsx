import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TimerProvider } from "@/contexts/TimerContext";
import { QuickTimerWidget } from "@/components/QuickTimerWidget";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Teams from "./pages/Teams";
import TeamDetails from "./pages/TeamDetails";
import Projects from "./pages/Projects";
import ProjectDetails from "./pages/ProjectDetails";
import Tasks from "./pages/Tasks";
import TaskDetails from "./pages/TaskDetails";
import PomodoroTimer from "./pages/PomodoroTimer";
import TimeEntries from "./pages/TimeEntries";
import Timesheets from "./pages/Timesheets";
import TimesheetApprovals from "./pages/TimesheetApprovals";
import Billing from "./pages/Billing";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import DeveloperSettings from "./pages/DeveloperSettings";
import NotFound from "./pages/NotFound";
import AccessDenied from "./pages/AccessDenied";
import ServerError from "./pages/ServerError";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <TimerProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/teams/:teamId" element={<TeamDetails />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectDetails />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:taskId" element={<TaskDetails />} />
            <Route path="/pomodoro" element={<PomodoroTimer />} />
            <Route path="/time-entries" element={<TimeEntries />} />
            <Route path="/timesheets" element={<Timesheets />} />
            <Route path="/timesheets/approvals" element={<TimesheetApprovals />} />
            <Route path="/settings/billing" element={<Billing />} />
            <Route path="/settings/developer" element={<DeveloperSettings />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/reports" element={<Reports />} />
            {/* Error Pages */}
            <Route path="/403" element={<AccessDenied />} />
            <Route path="/500" element={<ServerError />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <QuickTimerWidget />
        </BrowserRouter>
      </TimerProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
