// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

export interface AuthUser {
  id: string;
  email: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  role: 'admin' | 'manager' | 'member';
}

export async function signUp(email: string, password: string) {
  const redirectUrl = `${window.location.origin}/`;
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl
    }
  });

  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  return {
    id: user.id,
    email: user.email || ''
  };
}

export async function getUserOrganizations(): Promise<Organization[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_organizations' as any)
    .select(`
      role,
      organizations!inner (
        id,
        name,
        slug,
        timezone
      )
    `)
    .eq('user_id', user.id)
    .is('organizations.deleted_at', null)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Error fetching organizations:', error);
    return [];
  }

  if (!data) return [];

  // Remove duplicates based on organization id
  const uniqueOrgs = new Map();
  data.forEach((item: any) => {
    if (item.organizations && !uniqueOrgs.has(item.organizations.id)) {
      uniqueOrgs.set(item.organizations.id, {
        id: item.organizations.id,
        name: item.organizations.name,
        slug: item.organizations.slug,
        timezone: item.organizations.timezone,
        role: item.role
      });
    }
  });

  return Array.from(uniqueOrgs.values());
}

export async function getCurrentOrganization(): Promise<Organization | null> {
  const activeOrgId = localStorage.getItem('activeOrgId');
  if (!activeOrgId) {
    const orgs = await getUserOrganizations();
    return orgs[0] || null;
  }

  const orgs = await getUserOrganizations();
  const org = orgs.find(o => o.id === activeOrgId);
  return org || orgs[0] || null;
}
