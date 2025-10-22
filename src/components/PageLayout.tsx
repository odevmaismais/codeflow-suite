import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function PageLayout({ children, title, breadcrumbs }: PageLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-60 p-8">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-4 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <span key={index}>
                {crumb.href ? (
                  <a href={crumb.href} className="hover:text-primary">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="font-semibold text-foreground">{crumb.label}</span>
                )}
                {index < breadcrumbs.length - 1 && <span className="mx-2">›</span>}
              </span>
            ))}
          </nav>
        )}
        {title && <h1 className="text-3xl font-bold mb-6">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
