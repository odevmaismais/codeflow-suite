// @ts-nocheck
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut, getCurrentUser, getUserOrganizations, Organization } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Building2, ChevronDown, Clock, LogOut, Settings, Users, FolderOpen } from 'lucide-react';

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const authUser = await getCurrentUser();
    if (!authUser) {
      navigate('/auth');
      return;
    }

    setUser(authUser);

    const orgs = await getUserOrganizations();
    if (orgs.length === 0) {
      navigate('/onboarding');
      return;
    }

    setOrganizations(orgs);
    
    // Check localStorage for active org, otherwise use first
    const savedOrgId = localStorage.getItem('activeOrgId');
    const activeOrg = savedOrgId 
      ? orgs.find(o => o.id === savedOrgId) || orgs[0]
      : orgs[0];
    
    setCurrentOrg(activeOrg);
    localStorage.setItem('activeOrgId', activeOrg.id);
    setIsLoading(false);
  };

  const switchOrganization = (org: Organization) => {
    setCurrentOrg(org);
    localStorage.setItem('activeOrgId', org.id);
    toast({
      title: 'Organization switched',
      description: `Now viewing ${org.name}`
    });
  };

  const handleSignOut = async () => {
    await signOut();
    localStorage.removeItem('activeOrgId');
    navigate('/auth');
    toast({
      title: 'Signed out',
      description: 'Come back soon!'
    });
  };

  const navigateToSettings = () => {
    navigate('/settings');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Clock className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">DevFlow</span>
            </div>

            {/* Organization Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  {currentOrg?.name}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Your Organizations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {organizations.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => switchOrganization(org)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <span>{org.name}</span>
                    {currentOrg?.id === org.id && (
                      <span className="text-primary">✓</span>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate('/onboarding')}
                  className="cursor-pointer"
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  Create Organization
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {user?.email?.[0].toUpperCase()}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={navigateToSettings} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome back!</h1>
          <p className="text-muted-foreground">
            You're viewing {currentOrg?.name} • {currentOrg?.role}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Quick Start
              </CardTitle>
              <CardDescription>
                Start tracking time on your tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">Start Timer</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Team Management
              </CardTitle>
              <CardDescription>
                Manage your team and invite members
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => navigate('/teams')}
              >
                Manage Teams
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                Projects
              </CardTitle>
              <CardDescription>
                Manage projects and track progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => navigate('/projects')}
              >
                View Projects
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Organization
              </CardTitle>
              <CardDescription>
                View organization details and settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={navigateToSettings}
              >
                View Settings
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 p-8 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg border">
          <h2 className="text-2xl font-bold mb-4">🎉 Phase 1 Complete!</h2>
          <p className="text-muted-foreground mb-4">
            Authentication and multi-tenancy are now fully implemented. You can:
          </p>
          <ul className="space-y-2 text-muted-foreground">
            <li>✓ Sign up and sign in with email/password</li>
            <li>✓ Create organizations with unique slugs</li>
            <li>✓ Join organizations via invite codes</li>
            <li>✓ Switch between multiple organizations</li>
            <li>✓ Manage team members (coming next in Settings)</li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Ready to proceed to Phase 2: Teams & Projects?
          </p>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
