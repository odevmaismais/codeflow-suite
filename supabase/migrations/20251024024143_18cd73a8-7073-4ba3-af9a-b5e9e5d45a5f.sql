-- Fix infinite recursion in user_organizations UPDATE policy and create helper functions

-- Create function to check if user is admin of an organization
CREATE OR REPLACE FUNCTION public.is_org_admin(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizations
    WHERE user_id = p_user_id
      AND organization_id = p_org_id
      AND role = 'admin'
  );
$$;

-- Drop the problematic UPDATE policy
DROP POLICY IF EXISTS "user_orgs_update_admin_in_org" ON public.user_organizations;

-- Create new UPDATE policy using the security definer function
CREATE POLICY "user_orgs_update_admin_in_org"
ON public.user_organizations
FOR UPDATE
TO authenticated
USING (
  is_org_admin(auth.uid(), organization_id)
);

-- Also update the DELETE policy to avoid potential recursion
DROP POLICY IF EXISTS "Admins can remove members" ON public.user_organizations;

CREATE POLICY "Admins can remove members"
ON public.user_organizations
FOR DELETE
TO authenticated
USING (
  is_org_admin(auth.uid(), organization_id)
);