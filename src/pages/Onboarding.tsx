// @ts-nocheck
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getUserOrganizations } from '@/lib/auth';
import { Building2, Users } from 'lucide-react';

const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney'
];

const Onboarding = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [inviteCode, setInviteCode] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkExistingOrgs();
  }, []);

  const checkExistingOrgs = async () => {
    const orgs = await getUserOrganizations();
    if (orgs.length > 0) {
      navigate('/dashboard');
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orgName.trim()) {
      toast({
        title: 'Organization name required',
        description: 'Please enter a name for your organization',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);

    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Generate slug
      const { data: slugData, error: slugError } = await supabase
        .rpc('generate_unique_slug' as any, { org_name: orgName });

      if (slugError) throw slugError;

      // Create organization
      const { data: org, error: orgError } = await supabase
        .from('organizations' as any)
        .insert({
          name: orgName.trim(),
          slug: slugData,
          timezone
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Add user as admin
      const { error: memberError } = await supabase
        .from('user_organizations' as any)
        .insert({
          user_id: user.id,
          organization_id: org.id,
          role: 'admin'
        });

      if (memberError) throw memberError;

      toast({
        title: 'Organization created!',
        description: `Welcome to ${orgName}`
      });

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Failed to create organization',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteCode.trim()) {
      toast({
        title: 'Invite code required',
        description: 'Please enter an invite code',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);

    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Validate invite code
      const { data: invite, error: inviteError } = await supabase
        .from('invite_codes' as any)
        .select('*')
        .eq('code', inviteCode.toUpperCase())
        .single();

      if (inviteError || !invite) {
        throw new Error('Invalid or expired invite code');
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('user_organizations' as any)
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', invite.organization_id)
        .single();

      if (existing) {
        toast({
          title: 'Already a member',
          description: 'You are already part of this organization',
          variant: 'destructive'
        });
        setIsLoading(false);
        return;
      }

      // Add user as member
      const { error: memberError } = await supabase
        .from('user_organizations' as any)
        .insert({
          user_id: user.id,
          organization_id: invite.organization_id,
          role: 'member'
        });

      if (memberError) throw memberError;

      // Update invite code usage
      await supabase
        .from('invite_codes' as any)
        .update({ current_uses: invite.current_uses + 1 })
        .eq('id', invite.id);

      toast({
        title: 'Joined organization!',
        description: 'Redirecting to dashboard...'
      });

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Failed to join organization',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to DevFlow!</h1>
          <p className="text-muted-foreground">
            Let's set up your workspace
          </p>
        </div>

        <Card className="shadow-lg border-2">
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Create a new organization or join an existing one
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="create" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">
                  <Building2 className="mr-2 h-4 w-4" />
                  Create Organization
                </TabsTrigger>
                <TabsTrigger value="join">
                  <Users className="mr-2 h-4 w-4" />
                  Join Organization
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create" className="space-y-4 mt-6">
                <form onSubmit={handleCreateOrg} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input
                      id="org-name"
                      placeholder="Acme Corp"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone} disabled={isLoading}>
                      <SelectTrigger id="timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timezones.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating...' : 'Create Organization'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="join" className="space-y-4 mt-6">
                <form onSubmit={handleJoinOrg} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-code">Invite Code</Label>
                    <Input
                      id="invite-code"
                      placeholder="XXX-XXXXXX"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      disabled={isLoading}
                      maxLength={10}
                      className="uppercase"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the invite code provided by your organization admin
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Joining...' : 'Join Organization'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Onboarding;
