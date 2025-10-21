-- Phase 2: Teams & Projects Schema

-- ============================================================================
-- TABLES
-- ============================================================================

-- Teams Table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) >= 3 AND length(trim(name)) <= 50),
  description TEXT CHECK (length(description) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, name)
);

-- Team Members Junction Table
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_role TEXT NOT NULL CHECK (team_role IN ('tech_lead', 'developer', 'qa_tester', 'business_analyst', 'scrum_master', 'product_owner')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Projects Table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[A-Z]+-[0-9]+$'),
  name TEXT NOT NULL CHECK (length(trim(name)) >= 3 AND length(trim(name)) <= 100),
  description TEXT CHECK (length(description) <= 1000),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'archived')),
  start_date DATE,
  end_date DATE CHECK (end_date IS NULL OR end_date >= start_date),
  is_billable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, code)
);

-- Project Teams Junction Table
CREATE TABLE project_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, team_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_teams_deleted ON teams(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);

CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_deleted ON projects(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_project_teams_project ON project_teams(project_id);
CREATE INDEX idx_project_teams_team ON project_teams(team_id);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW-LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_teams ENABLE ROW LEVEL SECURITY;

-- TEAMS Policies
CREATE POLICY teams_select_members ON teams
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
  ));

CREATE POLICY teams_insert_admin ON teams
  FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  ));

CREATE POLICY teams_update_admin ON teams
  FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  ));

CREATE POLICY teams_delete_admin ON teams
  FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
    WHERE role = 'admin'
  ));

-- TEAM_MEMBERS Policies
CREATE POLICY team_members_select_org ON team_members
  FOR SELECT
  USING (team_id IN (
    SELECT id FROM teams WHERE organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
    )
  ));

CREATE POLICY team_members_insert_lead ON team_members
  FOR INSERT
  WITH CHECK (team_id IN (
    SELECT t.id FROM teams t
    WHERE t.organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
      WHERE role IN ('admin', 'manager')
    )
  ) OR team_id IN (
    SELECT tm.team_id FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.team_role = 'tech_lead'
  ));

CREATE POLICY team_members_update_lead ON team_members
  FOR UPDATE
  USING (team_id IN (
    SELECT tm.team_id FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.team_role = 'tech_lead'
  ) OR team_id IN (
    SELECT t.id FROM teams t
    WHERE t.organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
      WHERE role = 'admin'
    )
  ));

CREATE POLICY team_members_delete_lead ON team_members
  FOR DELETE
  USING (team_id IN (
    SELECT tm.team_id FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.team_role = 'tech_lead'
  ) OR team_id IN (
    SELECT t.id FROM teams t
    WHERE t.organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
      WHERE role = 'admin'
    )
  ));

-- PROJECTS Policies
CREATE POLICY projects_select_members ON projects
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
  ));

CREATE POLICY projects_insert_admin ON projects
  FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  ));

CREATE POLICY projects_update_admin ON projects
  FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  ));

CREATE POLICY projects_delete_admin ON projects
  FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
    WHERE role = 'admin'
  ));

-- PROJECT_TEAMS Policies
CREATE POLICY project_teams_select_org ON project_teams
  FOR SELECT
  USING (project_id IN (
    SELECT id FROM projects WHERE organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
    )
  ));

CREATE POLICY project_teams_insert_admin ON project_teams
  FOR INSERT
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
      WHERE role IN ('admin', 'manager')
    )
  ));

CREATE POLICY project_teams_delete_admin ON project_teams
  FOR DELETE
  USING (project_id IN (
    SELECT id FROM projects WHERE organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
      WHERE role IN ('admin', 'manager')
    )
  ));

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate unique project code
CREATE OR REPLACE FUNCTION generate_project_code(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_code TEXT;
  v_max_number INTEGER;
  v_new_code TEXT;
  v_counter INTEGER := 1;
BEGIN
  -- Get the maximum code number for this organization
  SELECT MAX(code) INTO v_max_code
  FROM projects
  WHERE organization_id = p_org_id
    AND code ~ '^PROJ-[0-9]+$';
  
  IF v_max_code IS NULL THEN
    v_max_number := 0;
  ELSE
    -- Extract number from code (e.g., "PROJ-0042" -> 42)
    v_max_number := CAST(substring(v_max_code from 'PROJ-([0-9]+)') AS INTEGER);
  END IF;
  
  -- Generate new code with incremental check for uniqueness
  LOOP
    v_new_code := 'PROJ-' || LPAD((v_max_number + v_counter)::TEXT, 4, '0');
    
    -- Check if code exists
    IF NOT EXISTS (
      SELECT 1 FROM projects 
      WHERE organization_id = p_org_id AND code = v_new_code
    ) THEN
      RETURN v_new_code;
    END IF;
    
    v_counter := v_counter + 1;
    
    -- Safety: prevent infinite loop
    IF v_counter > 9999 THEN
      RAISE EXCEPTION 'Unable to generate unique project code';
    END IF;
  END LOOP;
END;
$$;

-- Check team limit based on subscription
CREATE OR REPLACE FUNCTION check_team_limit(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_count INTEGER;
BEGIN
  -- Get subscription plan
  SELECT plan INTO v_plan
  FROM subscriptions
  WHERE organization_id = p_org_id;
  
  -- Get current team count
  SELECT COUNT(*) INTO v_count
  FROM teams
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL;
  
  -- Check limits
  IF v_plan = 'free' AND v_count >= 1 THEN
    RETURN false;
  ELSIF v_plan = 'pro' AND v_count >= 3 THEN
    RETURN false;
  ELSE
    RETURN true;
  END IF;
END;
$$;

-- Check project limit based on subscription
CREATE OR REPLACE FUNCTION check_project_limit(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_count INTEGER;
BEGIN
  -- Get subscription plan
  SELECT plan INTO v_plan
  FROM subscriptions
  WHERE organization_id = p_org_id;
  
  -- Get current project count
  SELECT COUNT(*) INTO v_count
  FROM projects
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL;
  
  -- Check limits
  IF v_plan = 'free' AND v_count >= 3 THEN
    RETURN false;
  ELSIF v_plan = 'pro' AND v_count >= 20 THEN
    RETURN false;
  ELSE
    RETURN true;
  END IF;
END;
$$;