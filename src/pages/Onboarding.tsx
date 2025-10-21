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
import { z } from 'zod';

const timezoneGroups = {
  'UTC': ['UTC'],
  'Americas (Brazil)': [
    'America/Sao_Paulo',
    'America/Manaus',
    'America/Fortaleza',
    'America/Recife',
    'America/Belem',
    'America/Cuiaba',
    'America/Porto_Velho',
    'America/Boa_Vista',
    'America/Rio_Branco',
    'America/Noronha'
  ],
  'Americas (Other)': [
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles'
  ],
  'Europe': [
    'Europe/London',
    'Europe/Paris'
  ],
  'Asia': [
    'Asia/Tokyo'
  ],
  'Pacific': [
    'Australia/Sydney'
  ]
};

const timezoneLabels: Record<string, string> = {
  'UTC': 'UTC - Coordinated Universal Time',
  'America/Sao_Paulo': 'São Paulo, Rio de Janeiro, Brasília (UTC-3)',
  'America/Manaus': 'Amazonas (UTC-4)',
  'America/Fortaleza': 'Ceará, Maranhão (UTC-3)',
  'America/Recife': 'Pernambuco (UTC-3)',
  'America/Belem': 'Pará (UTC-3)',
  'America/Cuiaba': 'Mato Grosso (UTC-4)',
  'America/Porto_Velho': 'Rondônia (UTC-4)',
  'America/Boa_Vista': 'Roraima (UTC-4)',
  'America/Rio_Branco': 'Acre (UTC-5)',
  'America/Noronha': 'Fernando de Noronha (UTC-2)',
  'America/New_York': 'Eastern Time (UTC-5/UTC-4)',
  'America/Chicago': 'Central Time (UTC-6/UTC-5)',
  'America/Los_Angeles': 'Pacific Time (UTC-8/UTC-7)',
  'Europe/London': 'London (UTC+0/UTC+1)',
  'Europe/Paris': 'Paris (UTC+1/UTC+2)',
  'Asia/Tokyo': 'Tokyo (UTC+9)',
  'Australia/Sydney': 'Sydney (UTC+11/UTC+10)'
};

// Detect browser timezone
const detectBrowserTimezone = (): string => {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Check if detected timezone is in our list
    const allTimezones = Object.values(timezoneGroups).flat();
    return allTimezones.includes(detected) ? detected : 'UTC';
  } catch {
    return 'UTC';
  }
};

const Onboarding = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [timezone, setTimezone] = useState(detectBrowserTimezone());
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

    const allTimezones = Object.values(timezoneGroups).flat();
    const OrgSchema = z.object({
      name: z.string().trim().min(3, { message: 'Organization name must be at least 3 characters' }).max(50, { message: 'Organization name must be at most 50 characters' }),
      timezone: z.string().refine((val) => allTimezones.includes(val), { message: 'Invalid timezone selected' }),
    });

    const parsed = OrgSchema.safeParse({ name: orgName, timezone });
    if (!parsed.success) {
      toast({ title: 'Validation error', description: parsed.error.errors[0].message, variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');

const { data, error } = await supabase.rpc('create_organization_atomic' as any, {
        p_user_id: user.id,
        p_org_name: orgName,
        p_timezone: timezone,
      });

      if (error) throw error;

      const res = data as any;
      if (!res?.success || !res?.organization_id) {
        throw new Error(res?.error || 'Failed to create organization');
      }

      const orgId = res.organization_id as string;

      // Verify membership persisted
      const { data: membership, error: memErr } = await supabase
        .from('user_organizations' as any)
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (memErr) console.error('Membership verification error:', memErr);
      if (!membership) throw new Error('Failed to link user to organization');

      // Store in localStorage immediately
      try {
        localStorage.setItem('activeOrgId', orgId);
        localStorage.setItem('activeOrgName', orgName.trim());
      } catch (e) {
        console.error('Failed to store org in localStorage:', e);
      }

      // Show success toast
      toast({
        title: 'Organization created successfully',
        description: `Welcome to ${orgName.trim()}`,
        duration: 3000
      });

      // Redirect immediately to dashboard (hard redirect)
      window.location.replace('/dashboard');
    } catch (error: any) {
      const msg = error?.message || 'Something went wrong. Please try again.';
      toast({ title: 'Failed to create organization', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinOrg = async (e: React.FormEvent) => {
    e.preventDefault();

    const InviteSchema = z.object({
      code: z
        .string()
        .trim()
        .transform((v) => v.toUpperCase())
        .regex(/^[A-Z]{3}-[A-Z0-9]{6}$/i, { message: 'Invite code format must be XXX-XXXXXX' }),
    });

    const parsed = InviteSchema.safeParse({ code: inviteCode });
    if (!parsed.success) {
      toast({ title: 'Invalid invite code', description: parsed.error.errors[0].message, variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');

const { data, error } = await supabase.rpc('join_organization_via_invite' as any, {
        p_invite_code: parsed.data.code,
        p_user_id: user.id,
      });
      if (error) throw error;

      const orgId = (data as string) || '';
      if (!orgId) throw new Error('Failed to join organization');

      // Store in localStorage immediately
      try {
        localStorage.setItem('activeOrgId', orgId);
      } catch (e) {
        console.error('Failed to store org in localStorage:', e);
      }

      // Fetch org name for display and persist
      try {
        const { data: orgData } = await supabase
          .from('organizations' as any)
          .select('name')
          .eq('id', orgId)
          .maybeSingle();
        if (orgData?.name) {
          localStorage.setItem('activeOrgName', orgData.name);
        }
      } catch (e) {
        // non-fatal, continue
      }

      // Show success toast
      toast({
        title: 'Joined organization successfully',
        description: 'Redirecting to dashboard...',
        duration: 3000
      });

      // Redirect immediately to dashboard (hard redirect)
      window.location.replace('/dashboard');
    } catch (error: any) {
      const raw = (error?.message || '').toLowerCase();
      let msg = 'Something went wrong. Please try again.';
      if (raw.includes('invalid') || raw.includes('expired')) msg = 'Invalid or expired invite code';
      if (raw.includes('already a member')) msg = 'You are already a member of this organization';
      toast({ title: 'Failed to join organization', description: msg, variant: 'destructive' });
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
                    <Select value={timezone} onValueChange={setTimezone} disabled={isLoading} required>
                      <SelectTrigger id="timezone">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {Object.entries(timezoneGroups).map(([group, zones]) => (
                          <div key={group}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                              {group}
                            </div>
                            {zones.map((tz) => (
                              <SelectItem key={tz} value={tz}>
                                {timezoneLabels[tz] || tz}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Auto-detected: {detectBrowserTimezone()}
                    </p>
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
