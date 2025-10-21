-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Users can view memberships in their organizations" ON public.user_organizations;
DROP POLICY IF EXISTS "Users can view organizations they belong to" ON public.organizations;
DROP POLICY IF EXISTS "Admins and managers can add members" ON public.user_organizations;

-- Create SIMPLE RLS policy for user_organizations (no subqueries)
CREATE POLICY "Users can view their own memberships"
  ON public.user_organizations FOR SELECT
  USING (user_id = auth.uid());

-- Create organizations SELECT policy that queries the TABLE directly
CREATE POLICY "Users can view organizations they belong to"
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id 
      FROM public.user_organizations 
      WHERE user_id = auth.uid()
    )
  );

-- Fix the INSERT policy for user_organizations to be simple
CREATE POLICY "Admins and managers can add members"
  ON public.user_organizations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM public.user_organizations 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );