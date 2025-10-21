-- Create function to check if user is tech lead of a team (bypasses RLS)
CREATE OR REPLACE FUNCTION is_team_tech_lead(p_user_id UUID, p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = p_user_id 
      AND team_id = p_team_id 
      AND team_role = 'tech_lead'
  );
$$;

-- Drop and recreate team_members policies to fix infinite recursion
DROP POLICY IF EXISTS team_members_insert_lead ON team_members;
DROP POLICY IF EXISTS team_members_update_lead ON team_members;
DROP POLICY IF EXISTS team_members_delete_lead ON team_members;

-- Insert policy: Admin/Manager can insert, or Tech Lead of the team
CREATE POLICY team_members_insert_lead ON team_members
FOR INSERT
WITH CHECK (
  team_id IN (
    SELECT t.id FROM teams t
    WHERE t.organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
      WHERE role IN ('admin', 'manager')
    )
  )
  OR
  is_team_tech_lead(auth.uid(), team_id)
);

-- Update policy: Only admins or tech leads can update
CREATE POLICY team_members_update_lead ON team_members
FOR UPDATE
USING (
  is_team_tech_lead(auth.uid(), team_id)
  OR
  team_id IN (
    SELECT t.id FROM teams t
    WHERE t.organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
      WHERE role = 'admin'
    )
  )
);

-- Delete policy: Only admins or tech leads can delete
CREATE POLICY team_members_delete_lead ON team_members
FOR DELETE
USING (
  is_team_tech_lead(auth.uid(), team_id)
  OR
  team_id IN (
    SELECT t.id FROM teams t
    WHERE t.organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
      WHERE role = 'admin'
    )
  )
);