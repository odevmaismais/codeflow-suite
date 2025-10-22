import { Link, useLocation } from "react-router-dom";
import {
  Home,
  FolderKanban,
  CheckSquare,
  Timer,
  Clock,
  Calendar,
  FileText,
  BarChart3,
  Settings
} from "lucide-react";

export function Sidebar() {
  const location = useLocation();

  const links = [
    { to: "/dashboard", icon: Home, label: "Home" },
    { to: "/projects", icon: FolderKanban, label: "Projects" },
    { to: "/tasks", icon: CheckSquare, label: "Tasks" },
    { to: "/pomodoro", icon: Timer, label: "Pomodoro" },
    { to: "/time-entries", icon: Clock, label: "Time Entries" },
    { to: "/timesheets", icon: Calendar, label: "Timesheets" },
    { to: "/reports", icon: FileText, label: "Reports" },
    { to: "/analytics", icon: BarChart3, label: "Analytics" },
    { to: "/settings/billing", icon: Settings, label: "Settings" },
  ];

  return (
    <aside className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-60 border-r bg-background overflow-y-auto">
      <nav className="p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.to || location.pathname.startsWith(link.to + "/");
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
