-- Fix type mismatch by explicitly casting email to text
CREATE OR REPLACE FUNCTION public.get_org_members_with_emails(p_org_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uo.user_id,
    au.email::TEXT,
    uo.role,
    uo.joined_at
  FROM user_organizations uo
  INNER JOIN auth.users au ON au.id = uo.user_id
  WHERE uo.organization_id = p_org_id
  ORDER BY uo.joined_at DESC;
END;
$$;

-- Fix type mismatch for team members function
CREATE OR REPLACE FUNCTION public.get_team_members_with_emails(p_team_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  team_role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tm.id,
    tm.user_id,
    au.email::TEXT,
    tm.team_role,
    tm.joined_at
  FROM team_members tm
  INNER JOIN auth.users au ON au.id = tm.user_id
  WHERE tm.team_id = p_team_id
  ORDER BY tm.joined_at DESC;
END;
$$;