-- Fix infinite recursion in user_organizations RLS policy

-- Drop the problematic policy
DROP POLICY IF EXISTS "user_orgs_select_org_members" ON public.user_organizations;

-- Create a security definer function to bypass RLS
CREATE OR REPLACE FUNCTION public.get_user_org_ids(p_user_id uuid)
RETURNS TABLE (organization_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id
  FROM public.user_organizations
  WHERE user_id = p_user_id;
$$;

-- Create the policy using the security definer function
CREATE POLICY "user_orgs_select_org_members" 
ON public.user_organizations 
FOR SELECT 
TO authenticated
USING (
  organization_id IN (
    SELECT get_user_org_ids(auth.uid())
  )
);