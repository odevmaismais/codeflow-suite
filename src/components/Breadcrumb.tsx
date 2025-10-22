import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export const Breadcrumb = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  // Generate breadcrumb items based on current path
  const getBreadcrumbItems = (): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [{ label: 'Home', href: '/dashboard' }];

    if (pathnames.length === 0) {
      return items;
    }

    // Map paths to readable labels
    const pathMap: Record<string, string> = {
      dashboard: 'Dashboard',
      projects: 'Projects',
      tasks: 'Tasks',
      pomodoro: 'Pomodoro',
      'time-entries': 'Time Entries',
      timesheets: 'Timesheets',
      approvals: 'Approvals',
      reports: 'Reports',
      analytics: 'Analytics',
      settings: 'Settings',
      billing: 'Billing',
      teams: 'Teams',
      developer: 'Developer',
      'audit-logs': 'Audit Logs',
    };

    pathnames.forEach((path, index) => {
      const href = `/${pathnames.slice(0, index + 1).join('/')}`;
      const label = pathMap[path] || path;

      // Skip if it's a UUID (detail pages will be handled separately)
      if (path.match(/^[a-f0-9-]{36}$/)) {
        return;
      }

      items.push({
        label,
        href: index === pathnames.length - 1 ? undefined : href,
      });
    });

    return items;
  };

  const items = getBreadcrumbItems();

  if (items.length === 1) {
    return null; // Don't show breadcrumb on home page
  }

  return (
    <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-4">
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          {index > 0 && <ChevronRight className="h-4 w-4 mx-2" />}
          {item.href ? (
            <Link
              to={item.href}
              className="hover:text-foreground transition-colors"
            >
              {index === 0 && <Home className="h-4 w-4" />}
              {index > 0 && item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
};
