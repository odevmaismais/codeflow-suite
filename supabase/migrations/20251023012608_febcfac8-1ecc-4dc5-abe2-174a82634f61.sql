-- Fix invite_codes RLS policies for proper delete access

-- Drop existing policies
DROP POLICY IF EXISTS "invites_update_creator" ON public.invite_codes;
DROP POLICY IF EXISTS "invites_insert_admin" ON public.invite_codes;
DROP POLICY IF EXISTS "invites_select_members" ON public.invite_codes;

-- Allow admins and managers to view invite codes
CREATE POLICY "invites_select_admin_manager" 
ON public.invite_codes 
FOR SELECT 
USING (
  organization_id IN (
    SELECT organization_id 
    FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  )
);

-- Allow admins and managers to create invite codes
CREATE POLICY "invites_insert_admin_manager" 
ON public.invite_codes 
FOR INSERT 
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  )
);

-- Allow admins and managers to update invite codes
CREATE POLICY "invites_update_admin_manager" 
ON public.invite_codes 
FOR UPDATE 
USING (
  organization_id IN (
    SELECT organization_id 
    FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  )
);

-- Allow admins and managers to delete invite codes
CREATE POLICY "invites_delete_admin_manager" 
ON public.invite_codes 
FOR DELETE 
USING (
  organization_id IN (
    SELECT organization_id 
    FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  )
);