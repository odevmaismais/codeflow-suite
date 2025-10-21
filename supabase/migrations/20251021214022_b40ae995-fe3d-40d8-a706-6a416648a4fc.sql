-- ============================================================
-- PHASE 3: TASKS SYSTEM
-- ============================================================

-- Create tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) >= 3 AND length(trim(title)) <= 200),
  description TEXT CHECK (length(description) <= 5000),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'blocked', 'done', 'archived')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  task_type TEXT NOT NULL DEFAULT 'feature' CHECK (task_type IN ('feature', 'bug', 'test', 'documentation', 'refactor', 'spike')),
  assigned_to UUID,
  created_by UUID NOT NULL,
  estimated_hours DECIMAL(5,2) CHECK (estimated_hours >= 0 AND estimated_hours <= 999.99),
  actual_hours DECIMAL(5,2) DEFAULT 0 CHECK (actual_hours >= 0),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, code),
  CHECK (parent_task_id IS NULL OR parent_task_id != id)
);

CREATE INDEX idx_tasks_org ON tasks(organization_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NULL;

-- Create task_comments table
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (length(trim(content)) >= 1 AND length(content) <= 2000),
  mentioned_users UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_comments_task ON task_comments(task_id);
CREATE INDEX idx_comments_user ON task_comments(user_id);
CREATE INDEX idx_comments_deleted ON task_comments(deleted_at) WHERE deleted_at IS NULL;

-- Create task_attachments table
CREATE TABLE task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  file_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_attachments_task ON task_attachments(task_id);
CREATE INDEX idx_attachments_deleted ON task_attachments(deleted_at) WHERE deleted_at IS NULL;

-- Create task_watchers table
CREATE TABLE task_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX idx_watchers_task ON task_watchers(task_id);
CREATE INDEX idx_watchers_user ON task_watchers(user_id);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_watchers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: TASKS
-- ============================================================

CREATE POLICY tasks_select_members ON tasks
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
  )
  AND (
    project_id IS NULL 
    OR project_id IN (
      SELECT p.id FROM projects p
      JOIN project_teams pt ON p.id = pt.project_id
      JOIN team_members tm ON pt.team_id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
    OR created_by = auth.uid()
  )
);

CREATE POLICY tasks_insert_members ON tasks
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
  )
  AND (
    project_id IS NULL
    OR project_id IN (
      SELECT p.id FROM projects p
      JOIN project_teams pt ON p.id = pt.project_id
      JOIN team_members tm ON pt.team_id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  )
);

CREATE POLICY tasks_update_assigned ON tasks
FOR UPDATE
USING (
  assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN project_teams pt ON tm.team_id = pt.team_id
    WHERE pt.project_id = tasks.project_id
      AND tm.user_id = auth.uid()
      AND tm.team_role IN ('tech_lead', 'product_owner')
  )
);

CREATE POLICY tasks_delete_creator ON tasks
FOR DELETE
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN project_teams pt ON tm.team_id = pt.team_id
    WHERE pt.project_id = tasks.project_id
      AND tm.user_id = auth.uid()
      AND tm.team_role = 'tech_lead'
  )
);

-- ============================================================
-- RLS POLICIES: TASK_COMMENTS
-- ============================================================

CREATE POLICY comments_select_task_viewers ON task_comments
FOR SELECT
USING (
  task_id IN (
    SELECT id FROM tasks WHERE organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
    )
  )
);

CREATE POLICY comments_insert_task_members ON task_comments
FOR INSERT
WITH CHECK (
  task_id IN (
    SELECT id FROM tasks WHERE organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
    )
  )
);

CREATE POLICY comments_update_own ON task_comments
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY comments_delete_own ON task_comments
FOR DELETE
USING (user_id = auth.uid());

-- ============================================================
-- RLS POLICIES: TASK_ATTACHMENTS
-- ============================================================

CREATE POLICY attachments_select_task_viewers ON task_attachments
FOR SELECT
USING (
  task_id IN (
    SELECT id FROM tasks WHERE organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
    )
  )
);

CREATE POLICY attachments_insert_task_members ON task_attachments
FOR INSERT
WITH CHECK (
  task_id IN (
    SELECT id FROM tasks WHERE organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
    )
  )
);

CREATE POLICY attachments_delete_uploader ON task_attachments
FOR DELETE
USING (uploaded_by = auth.uid());

-- ============================================================
-- RLS POLICIES: TASK_WATCHERS
-- ============================================================

CREATE POLICY watchers_select_own ON task_watchers
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY watchers_insert_own ON task_watchers
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY watchers_delete_own ON task_watchers
FOR DELETE
USING (user_id = auth.uid());

-- ============================================================
-- FUNCTION: generate_task_code
-- ============================================================

CREATE OR REPLACE FUNCTION generate_task_code(p_org_id UUID, p_project_id UUID, p_parent_task_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_max_number INTEGER;
  v_org_slug TEXT;
  v_project_code TEXT;
  v_parent_code TEXT;
BEGIN
  -- Personal task (no project)
  IF p_project_id IS NULL THEN
    SELECT slug INTO v_org_slug FROM organizations WHERE id = p_org_id;
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)), 0)
    INTO v_max_number
    FROM tasks
    WHERE organization_id = p_org_id AND project_id IS NULL;
    
    v_code := v_org_slug || '-PERSONAL-' || LPAD((v_max_number + 1)::TEXT, 3, '0');
    
  -- Subtask
  ELSIF p_parent_task_id IS NOT NULL THEN
    SELECT code INTO v_parent_code FROM tasks WHERE id = p_parent_task_id;
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 'S([0-9]+)$') AS INTEGER)), 0)
    INTO v_max_number
    FROM tasks
    WHERE parent_task_id = p_parent_task_id;
    
    v_code := v_parent_code || '-S' || LPAD((v_max_number + 1)::TEXT, 3, '0');
    
  -- Regular task
  ELSE
    SELECT code INTO v_project_code FROM projects WHERE id = p_project_id;
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 'T([0-9]+)') AS INTEGER)), 0)
    INTO v_max_number
    FROM tasks
    WHERE project_id = p_project_id AND parent_task_id IS NULL;
    
    v_code := v_project_code || '-T' || LPAD((v_max_number + 1)::TEXT, 3, '0');
  END IF;
  
  RETURN v_code;
END;
$$;

-- ============================================================
-- FUNCTION: check_task_limit
-- ============================================================

CREATE OR REPLACE FUNCTION check_task_limit(p_org_id UUID, p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_count INTEGER;
BEGIN
  SELECT plan INTO v_plan
  FROM subscriptions
  WHERE organization_id = p_org_id;
  
  SELECT COUNT(*) INTO v_count
  FROM tasks
  WHERE project_id = p_project_id
    AND deleted_at IS NULL
    AND parent_task_id IS NULL;
  
  IF v_plan = 'free' AND v_count >= 50 THEN
    RETURN false;
  ELSE
    RETURN true;
  END IF;
END;
$$;

-- ============================================================
-- FUNCTION: check_subtasks_complete
-- ============================================================

CREATE OR REPLACE FUNCTION check_subtasks_complete(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM tasks
  WHERE parent_task_id = p_task_id
    AND status != 'done'
    AND deleted_at IS NULL;
  
  IF v_count > 0 THEN
    RETURN false;
  ELSE
    RETURN true;
  END IF;
END;
$$;

-- ============================================================
-- FUNCTION: extract_mentions
-- ============================================================

CREATE OR REPLACE FUNCTION extract_mentions(p_content TEXT)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mentions TEXT[];
  v_mention TEXT;
  v_user_ids UUID[];
  v_user_id UUID;
BEGIN
  v_user_ids := ARRAY[]::UUID[];
  
  -- Extract @mentions (email format or username)
  v_mentions := regexp_matches(p_content, '@([\w.-]+@[\w.-]+|\w+)', 'g');
  
  IF v_mentions IS NOT NULL THEN
    FOREACH v_mention IN ARRAY v_mentions LOOP
      -- Try to find user by email or username
      SELECT id INTO v_user_id
      FROM auth.users
      WHERE email = v_mention
         OR raw_user_meta_data->>'username' = v_mention
      LIMIT 1;
      
      IF v_user_id IS NOT NULL THEN
        v_user_ids := array_append(v_user_ids, v_user_id);
      END IF;
    END LOOP;
  END IF;
  
  RETURN v_user_ids;
END;
$$;

-- ============================================================
-- FUNCTION: add_watchers
-- ============================================================

CREATE OR REPLACE FUNCTION add_watchers(p_task_id UUID, p_user_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  FOREACH v_user_id IN ARRAY p_user_ids LOOP
    INSERT INTO task_watchers (task_id, user_id)
    VALUES (p_task_id, v_user_id)
    ON CONFLICT (task_id, user_id) DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================
-- TRIGGER: Update updated_at on tasks
-- ============================================================

CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_comments_updated_at
BEFORE UPDATE ON task_comments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();