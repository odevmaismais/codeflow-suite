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
  const { data, error } = await supabase
    .from('user_organizations' as any)
    .select(`
      role,
      organizations (
        id,
        name,
        slug,
        timezone
      )
    `)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Error fetching organizations:', error);
    return [];
  }

  return data.map((item: any) => ({
    id: item.organizations.id,
    name: item.organizations.name,
    slug: item.organizations.slug,
    timezone: item.organizations.timezone,
    role: item.role
  }));
}
