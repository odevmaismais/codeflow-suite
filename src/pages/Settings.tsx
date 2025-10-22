// @ts-nocheck
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getUserOrganizations, Organization } from '@/lib/auth';
import { ArrowLeft, Copy, UserPlus, Clock, CreditCard } from 'lucide-react';
import { SubscriptionCard } from '@/components/SubscriptionCard';

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
}

const Settings = () => {
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
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
    await loadMembers(activeOrg.id);
    setIsLoading(false);
  };

  const loadMembers = async (orgId: string) => {
    const { data, error } = await supabase
      .from('user_organizations')
      .select('id, user_id, role, created_at')
      .eq('organization_id', orgId);

    if (error) {
      console.error('Error loading members:', error);
      return;
    }

    // Fetch user emails (Note: In production, you'd get this from a profiles table)
    const membersWithEmails = data.map(member => ({
      ...member,
      email: 'user@example.com' // Placeholder - would come from profiles table
    }));

    setMembers(membersWithEmails);
  };

  const generateInviteCode = async () => {
    if (!currentOrg) return;
    
    if (currentOrg.role !== 'admin' && currentOrg.role !== 'manager') {
      toast({
        title: 'Permission denied',
        description: 'Only admins and managers can create invite codes',
        variant: 'destructive'
      });
      return;
    }

    setIsGeneratingCode(true);

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      // Generate code
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_invite_code');

      if (codeError) throw codeError;

      // Create invite
      const { error: inviteError } = await supabase
        .from('invite_codes')
        .insert({
          organization_id: currentOrg.id,
          code: codeData,
          created_by: user.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

      if (inviteError) throw inviteError;

      setInviteCode(codeData);
      setShowCodeDialog(true);
      toast({
        title: 'Invite code generated!',
        description: 'Share this code with your team members'
      });
    } catch (error: any) {
      toast({
        title: 'Failed to generate invite code',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    toast({
      title: 'Copied!',
      description: 'Invite code copied to clipboard'
    });
  };

  const updateMemberRole = async (memberId: string, newRole: string) => {
    if (!currentOrg || currentOrg.role !== 'admin') {
      toast({
        title: 'Permission denied',
        description: 'Only admins can change roles',
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase
      .from('user_organizations')
      .update({ role: newRole })
      .eq('id', memberId);

    if (error) {
      toast({
        title: 'Failed to update role',
        description: error.message,
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: 'Role updated',
      description: 'Member role has been changed'
    });

    loadMembers(currentOrg.id);
  };

  const removeMember = async (memberId: string) => {
    if (!currentOrg || currentOrg.role !== 'admin') {
      toast({
        title: 'Permission denied',
        description: 'Only admins can remove members',
        variant: 'destructive'
      });
      return;
    }

    // Check if this is the last admin
    const adminCount = members.filter(m => m.role === 'admin').length;
    const memberToRemove = members.find(m => m.id === memberId);
    
    if (adminCount === 1 && memberToRemove?.role === 'admin') {
      toast({
        title: 'Cannot remove last admin',
        description: 'Organization must have at least one admin',
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase
      .from('user_organizations')
      .delete()
      .eq('id', memberId);

    if (error) {
      toast({
        title: 'Failed to remove member',
        description: error.message,
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: 'Member removed',
      description: 'Team member has been removed from the organization'
    });

    loadMembers(currentOrg.id);
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
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Organization Settings</h1>
            <p className="text-muted-foreground">{currentOrg?.name}</p>
          </div>

          {/* Quick Links - Admin Only */}
          {userRole === 'admin' && (
            <Card>
              <CardHeader>
                <CardTitle>Quick Links</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => navigate('/settings/billing')}
                  className="w-full sm:w-auto"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Manage Billing & Subscription
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Team Members */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>
                    Manage your organization's team members
                  </CardDescription>
                </div>
                <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
                  <DialogTrigger asChild>
                    <Button
                      onClick={generateInviteCode}
                      disabled={isGeneratingCode}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Invite Members
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Team Members</DialogTitle>
                      <DialogDescription>
                        Share this code with people you want to invite. It expires in 7 days.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <Label className="text-xs text-muted-foreground">Invite Code</Label>
                        <div className="flex items-center gap-2 mt-2">
                          <code className="text-2xl font-mono font-bold flex-1">
                            {inviteCode}
                          </code>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={copyInviteCode}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        New members will join as "Member" and can be promoted by admins.
                      </p>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{member.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Joined {new Date(member.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {currentOrg?.role === 'admin' ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => updateMemberRole(member.id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{member.role}</Badge>
                      )}
                      {currentOrg?.role === 'admin' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMember(member.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Subscription Info */}
          <SubscriptionCard organizationId={currentOrg?.id} onUpdate={loadOrgData} />
        </div>
      </div>
    </div>
  );
};

export default Settings;
