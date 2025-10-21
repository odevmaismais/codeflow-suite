-- Create function to get user emails (SECURITY DEFINER to access auth.users)
CREATE OR REPLACE FUNCTION get_user_email(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = p_user_id;
  
  RETURN v_email;
END;
$$;

-- Create function to get organization members with emails
CREATE OR REPLACE FUNCTION get_org_members_with_emails(p_org_id UUID)
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
    au.email,
    uo.role,
    uo.joined_at
  FROM user_organizations uo
  INNER JOIN auth.users au ON au.id = uo.user_id
  WHERE uo.organization_id = p_org_id
  ORDER BY uo.joined_at DESC;
END;
$$;

-- Create function to get team members with emails
CREATE OR REPLACE FUNCTION get_team_members_with_emails(p_team_id UUID)
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
    au.email,
    tm.team_role,
    tm.joined_at
  FROM team_members tm
  INNER JOIN auth.users au ON au.id = tm.user_id
  WHERE tm.team_id = p_team_id
  ORDER BY tm.joined_at DESC;
END;
$$;