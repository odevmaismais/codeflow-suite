import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getUserOrganizations, Organization } from '@/lib/auth';
import { ArrowLeft, AlertTriangle, Clock } from 'lucide-react';

const DeveloperSettings = () => {
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showFullWipeDialog, setShowFullWipeDialog] = useState(false);
  const [confirmAllText, setConfirmAllText] = useState('');
  const [isWipingAll, setIsWipingAll] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadOrgData();
  }, []);

  const loadOrgData = async () => {
    const user = await getCurrentUser();
    if (!user) {
      navigate('/auth');
      return;
    }

    const orgs = await getUserOrganizations();
    const savedOrgId = localStorage.getItem('activeOrgId');
    const activeOrg = savedOrgId 
      ? orgs.find(o => o.id === savedOrgId) || orgs[0]
      : orgs[0];

    if (!activeOrg) {
      navigate('/onboarding');
      return;
    }

    setCurrentOrg(activeOrg);
    setUserRole(activeOrg.role);
    setIsLoading(false);

    // Only admins can access this page
    if (activeOrg.role !== 'admin') {
      toast({
        title: 'Access Denied',
        description: 'Only admins can access developer settings',
        variant: 'destructive'
      });
      navigate('/settings');
    }
  };

  const handleFullWipe = async () => {
    if (confirmAllText !== 'WIPE ALL') {
      toast({
        title: 'Invalid confirmation',
        description: 'Please type "WIPE ALL" to confirm',
        variant: 'destructive'
      });
      return;
    }

    if (!currentOrg) return;

    setIsWipingAll(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('reset-all', {
        body: { orgId: currentOrg.id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast({
        title: 'Complete wipe successful',
        description: 'All data including organization and users have been deleted'
      });

      // Sign out and redirect
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (error: any) {
      toast({
        title: 'Failed to wipe all data',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsWipingAll(false);
    }
  };

  const handleResetDatabase = async () => {
    if (confirmText !== 'RESET') {
      toast({
        title: 'Invalid confirmation',
        description: 'Please type "RESET" to confirm',
        variant: 'destructive'
      });
      return;
    }

    if (!currentOrg) return;

    setIsResetting(true);

    try {
      const { data, error } = await supabase
        .rpc('reset_database_for_org', {
          p_org_id: currentOrg.id
        });

      if (error) throw error;

      toast({
        title: 'Database reset successfully',
        description: 'All data for this organization has been deleted'
      });

      setShowResetDialog(false);
      setConfirmText('');
      
      // Reload page to show empty state
      window.location.reload();
    } catch (error: any) {
      toast({
        title: 'Failed to reset database',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Clock className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (userRole !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate('/settings')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Developer Settings</h1>
            <p className="text-muted-foreground">Advanced options for testing and development</p>
          </div>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
              </div>
              <CardDescription>
                These actions are irreversible. Use with caution.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Reset Database</h3>
                    <p className="text-sm text-muted-foreground">
                      Delete all data for this organization (projects, tasks, time entries, etc.). 
                      Organization and users remain intact.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setShowResetDialog(true)}
                    className="shrink-0"
                  >
                    ⚠️ Reset Database
                  </Button>
                </div>

                <div className="flex items-start justify-between gap-4 pt-4 border-t border-destructive">
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Full Wipe (Nuclear Option)</h3>
                    <p className="text-sm text-muted-foreground">
                      Delete EVERYTHING: organization, all users, all data. 
                      You will be logged out immediately.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setShowFullWipeDialog(true)}
                    className="shrink-0"
                  >
                    💣 Full Wipe
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Organization Info */}
          <Card>
            <CardHeader>
              <CardTitle>Organization Info</CardTitle>
              <CardDescription>Current organization details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{currentOrg?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID:</span>
                  <span className="font-mono text-xs">{currentOrg?.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Your Role:</span>
                  <span className="font-medium capitalize">{userRole}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Reset Database
            </DialogTitle>
            <DialogDescription>
              This will <strong>DELETE ALL DATA</strong> for "{currentOrg?.name}" including:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All projects and tasks</li>
                <li>All time entries and timesheets</li>
                <li>All teams and team members</li>
                <li>All audit logs</li>
              </ul>
              <p className="mt-4 font-semibold">This action cannot be undone.</p>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-text">
                Type <code className="bg-muted px-2 py-1 rounded font-mono">RESET</code> to confirm
              </Label>
              <Input
                id="confirm-text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResetDialog(false);
                setConfirmText('');
              }}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetDatabase}
              disabled={confirmText !== 'RESET' || isResetting}
            >
              {isResetting ? (
                <>
                  <Clock className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Database'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Wipe Confirmation Dialog */}
      <Dialog open={showFullWipeDialog} onOpenChange={setShowFullWipeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Full Wipe - Nuclear Option
            </DialogTitle>
            <DialogDescription>
              This will <strong>DELETE EVERYTHING</strong> including:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>The entire organization "{currentOrg?.name}"</li>
                <li>All users in this organization</li>
                <li>All projects, tasks, teams, and data</li>
                <li>All subscriptions and billing info</li>
              </ul>
              <p className="mt-4 font-semibold text-destructive">
                You will be logged out immediately after this operation.
                This action is IRREVERSIBLE!
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-all-text">
                Type <code className="bg-destructive/10 px-2 py-1 rounded font-mono text-destructive">WIPE ALL</code> to confirm
              </Label>
              <Input
                id="confirm-all-text"
                value={confirmAllText}
                onChange={(e) => setConfirmAllText(e.target.value)}
                placeholder="WIPE ALL"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowFullWipeDialog(false);
                setConfirmAllText('');
              }}
              disabled={isWipingAll}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFullWipe}
              disabled={confirmAllText !== 'WIPE ALL' || isWipingAll}
            >
              {isWipingAll ? (
                <>
                  <Clock className="mr-2 h-4 w-4 animate-spin" />
                  Wiping...
                </>
              ) : (
                '💣 Wipe Everything'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeveloperSettings;
