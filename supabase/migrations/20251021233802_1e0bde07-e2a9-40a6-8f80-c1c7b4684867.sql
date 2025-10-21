-- Create time_entries table
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  timer_type TEXT NOT NULL CHECK (timer_type IN ('pomodoro_focus', 'pomodoro_break', 'quick_timer', 'manual')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER CHECK (duration_seconds >= 0),
  description TEXT CHECK (length(description) <= 500),
  is_billable BOOLEAN DEFAULT true,
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (end_time IS NULL OR end_time > start_time),
  CHECK (task_id IS NOT NULL OR project_id IS NOT NULL)
);

CREATE INDEX idx_time_entries_org ON time_entries(organization_id);
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_task ON time_entries(task_id);
CREATE INDEX idx_time_entries_project ON time_entries(project_id);
CREATE INDEX idx_time_entries_start ON time_entries(start_time);
CREATE INDEX idx_time_entries_deleted ON time_entries(deleted_at) WHERE deleted_at IS NULL;

-- Create pomodoro_sessions table
CREATE TABLE pomodoro_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  focus_count INTEGER DEFAULT 0,
  break_count INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pomodoro_user ON pomodoro_sessions(user_id);
CREATE INDEX idx_pomodoro_task ON pomodoro_sessions(task_id);

-- RLS Policies for time_entries
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_entries_select_own ON time_entries
FOR SELECT
USING (
  user_id = auth.uid()
  OR organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  )
  OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN project_teams pt ON tm.team_id = pt.team_id
    WHERE pt.project_id = time_entries.project_id
      AND tm.user_id = auth.uid()
      AND tm.team_role = 'tech_lead'
  )
);

CREATE POLICY time_entries_insert_own ON time_entries
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
  )
);

CREATE POLICY time_entries_update_own ON time_entries
FOR UPDATE
USING (
  (user_id = auth.uid() AND is_approved = false)
  OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN project_teams pt ON tm.team_id = pt.team_id
    WHERE pt.project_id = time_entries.project_id
      AND tm.user_id = auth.uid()
      AND tm.team_role = 'tech_lead'
  )
);

CREATE POLICY time_entries_delete_own ON time_entries
FOR DELETE
USING (
  (user_id = auth.uid() AND is_approved = false)
  OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN project_teams pt ON tm.team_id = pt.team_id
    WHERE pt.project_id = time_entries.project_id
      AND tm.user_id = auth.uid()
      AND tm.team_role = 'tech_lead'
  )
);

-- RLS Policies for pomodoro_sessions
ALTER TABLE pomodoro_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pomodoro_select_own ON pomodoro_sessions
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY pomodoro_insert_own ON pomodoro_sessions
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY pomodoro_update_own ON pomodoro_sessions
FOR UPDATE
USING (user_id = auth.uid());

-- Function: Check for overlapping time entries
CREATE OR REPLACE FUNCTION check_time_entry_overlap(
  p_user_id UUID, 
  p_start_time TIMESTAMPTZ, 
  p_end_time TIMESTAMPTZ, 
  p_entry_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM time_entries
    WHERE user_id = p_user_id
      AND deleted_at IS NULL
      AND (p_entry_id IS NULL OR id != p_entry_id)
      AND (
        (start_time <= p_start_time AND end_time > p_start_time)
        OR (start_time < p_end_time AND end_time >= p_end_time)
        OR (start_time >= p_start_time AND end_time <= p_end_time)
      )
  );
END;
$$;

-- Function: Check time entry limit for free plan
CREATE OR REPLACE FUNCTION check_time_entry_limit(p_org_id UUID, p_user_id UUID) 
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
  FROM time_entries
  WHERE user_id = p_user_id
    AND start_time >= date_trunc('month', NOW())
    AND deleted_at IS NULL;
  
  IF v_plan = 'free' AND v_count >= 100 THEN
    RETURN false;
  ELSE
    RETURN true;
  END IF;
END;
$$;

-- Function: Calculate duration in seconds
CREATE OR REPLACE FUNCTION calculate_duration_seconds(p_start_time TIMESTAMPTZ, p_end_time TIMESTAMPTZ) 
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXTRACT(EPOCH FROM (p_end_time - p_start_time))::INTEGER;
$$;

-- Function: Format duration as "Xh Ym"
CREATE OR REPLACE FUNCTION format_duration(p_seconds INTEGER) 
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_hours INTEGER;
  v_minutes INTEGER;
BEGIN
  v_hours := p_seconds / 3600;
  v_minutes := (p_seconds % 3600) / 60;
  
  IF v_hours > 0 AND v_minutes > 0 THEN
    RETURN v_hours || 'h ' || v_minutes || 'm';
  ELSIF v_hours > 0 THEN
    RETURN v_hours || 'h';
  ELSIF v_minutes > 0 THEN
    RETURN v_minutes || 'm';
  ELSE
    RETURN p_seconds || 's';
  END IF;
END;
$$;

-- Function: Update task actual hours
CREATE OR REPLACE FUNCTION update_task_actual_hours(p_task_id UUID) 
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE tasks
  SET actual_hours = (
    SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0
    FROM time_entries
    WHERE task_id = p_task_id AND deleted_at IS NULL
  )
  WHERE id = p_task_id;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_time_entries_updated_at
BEFORE UPDATE ON time_entries
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();