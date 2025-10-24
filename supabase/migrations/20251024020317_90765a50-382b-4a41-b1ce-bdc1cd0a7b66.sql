-- Drop the restrictive SELECT policy and create a better one
DROP POLICY IF EXISTS "user_orgs_select_own" ON public.user_organizations;

-- Allow users to see all members of organizations they belong to
CREATE POLICY "user_orgs_select_org_members" 
ON public.user_organizations 
FOR SELECT 
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.user_organizations 
    WHERE user_id = auth.uid()
  )
);

-- Update the admin policy to allow admins to update any member's role in their org
DROP POLICY IF EXISTS "user_orgs_update_admin" ON public.user_organizations;

CREATE POLICY "user_orgs_update_admin_in_org"
ON public.user_organizations
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.user_organizations 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);