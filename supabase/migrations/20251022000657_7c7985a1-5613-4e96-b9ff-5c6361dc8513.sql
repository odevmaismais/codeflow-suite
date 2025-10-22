-- Create timesheets table
CREATE TABLE timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  total_hours DECIMAL(5,2) DEFAULT 0 CHECK (total_hours >= 0),
  billable_hours DECIMAL(5,2) DEFAULT 0 CHECK (billable_hours >= 0),
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (length(rejection_reason) <= 500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, user_id, week_start_date),
  CHECK (week_end_date = week_start_date + INTERVAL '6 days')
);

CREATE INDEX idx_timesheets_org ON timesheets(organization_id);
CREATE INDEX idx_timesheets_user ON timesheets(user_id);
CREATE INDEX idx_timesheets_week ON timesheets(week_start_date);
CREATE INDEX idx_timesheets_status ON timesheets(status);
CREATE INDEX idx_timesheets_deleted ON timesheets(deleted_at) WHERE deleted_at IS NULL;

-- Create timesheet_entries junction table
CREATE TABLE timesheet_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(timesheet_id, time_entry_id)
);

CREATE INDEX idx_timesheet_entries_timesheet ON timesheet_entries(timesheet_id);
CREATE INDEX idx_timesheet_entries_entry ON timesheet_entries(time_entry_id);

-- Enable RLS on timesheets
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

-- RLS policies for timesheets
CREATE POLICY timesheets_select_own ON timesheets
FOR SELECT
USING (
  user_id = auth.uid()
  OR organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  )
  OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN user_organizations uo ON tm.user_id = timesheets.user_id
    WHERE tm.user_id = auth.uid()
      AND tm.team_role = 'tech_lead'
      AND uo.organization_id = timesheets.organization_id
  )
);

CREATE POLICY timesheets_insert_own ON timesheets
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
  )
);

CREATE POLICY timesheets_update_own ON timesheets
FOR UPDATE
USING (
  (user_id = auth.uid() AND status = 'draft')
  OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN user_organizations uo ON tm.user_id = timesheets.user_id
    WHERE tm.user_id = auth.uid()
      AND tm.team_role = 'tech_lead'
      AND uo.organization_id = timesheets.organization_id
  )
);

CREATE POLICY timesheets_delete_own ON timesheets
FOR DELETE
USING (user_id = auth.uid() AND status = 'draft');

-- Enable RLS on timesheet_entries
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for timesheet_entries
CREATE POLICY timesheet_entries_select_own ON timesheet_entries
FOR SELECT
USING (
  timesheet_id IN (
    SELECT id FROM timesheets WHERE user_id = auth.uid()
  )
  OR timesheet_id IN (
    SELECT ts.id FROM timesheets ts
    JOIN team_members tm ON ts.user_id = tm.user_id
    WHERE tm.user_id = auth.uid() AND tm.team_role = 'tech_lead'
  )
);

CREATE POLICY timesheet_entries_insert_own ON timesheet_entries
FOR INSERT
WITH CHECK (
  timesheet_id IN (
    SELECT id FROM timesheets WHERE user_id = auth.uid() AND status = 'draft'
  )
);

CREATE POLICY timesheet_entries_delete_own ON timesheet_entries
FOR DELETE
USING (
  timesheet_id IN (
    SELECT id FROM timesheets WHERE user_id = auth.uid() AND status = 'draft'
  )
);

-- Function: calculate_timesheet_hours
CREATE OR REPLACE FUNCTION calculate_timesheet_hours(p_timesheet_id UUID)
RETURNS TABLE(total_hours DECIMAL, billable_hours DECIMAL)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(te.duration_seconds), 0) / 3600.0 AS total_hours,
    COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_seconds ELSE 0 END), 0) / 3600.0 AS billable_hours
  FROM time_entries te
  JOIN timesheet_entries tse ON te.id = tse.time_entry_id
  WHERE tse.timesheet_id = p_timesheet_id AND te.deleted_at IS NULL;
$$;

-- Function: get_orphaned_time_entries
CREATE OR REPLACE FUNCTION get_orphaned_time_entries(p_user_id UUID, p_week_start DATE)
RETURNS TABLE(
  id UUID,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER,
  description TEXT,
  is_billable BOOLEAN,
  task_id UUID,
  project_id UUID
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT te.id, te.start_time, te.end_time, te.duration_seconds, te.description, 
         te.is_billable, te.task_id, te.project_id
  FROM time_entries te
  WHERE te.user_id = p_user_id
    AND te.start_time::date BETWEEN p_week_start AND p_week_start + 6
    AND te.id NOT IN (SELECT time_entry_id FROM timesheet_entries)
    AND te.deleted_at IS NULL
  ORDER BY te.start_time;
$$;

-- Update time_entries RLS to block edits on approved entries
DROP POLICY IF EXISTS time_entries_update_own ON time_entries;
CREATE POLICY time_entries_update_own ON time_entries
FOR UPDATE
USING (
  ((user_id = auth.uid() AND is_approved = false)
  OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN project_teams pt ON tm.team_id = pt.team_id
    WHERE pt.project_id = time_entries.project_id
      AND tm.user_id = auth.uid()
      AND tm.team_role = 'tech_lead'
  ))
  AND NOT EXISTS (
    SELECT 1 FROM timesheet_entries te
    JOIN timesheets ts ON te.timesheet_id = ts.id
    WHERE te.time_entry_id = time_entries.id
      AND ts.status = 'approved'
  )
);

-- Update time_entries RLS to block deletes on approved entries
DROP POLICY IF EXISTS time_entries_delete_own ON time_entries;
CREATE POLICY time_entries_delete_own ON time_entries
FOR DELETE
USING (
  ((user_id = auth.uid() AND is_approved = false)
  OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN project_teams pt ON tm.team_id = pt.team_id
    WHERE pt.project_id = time_entries.project_id
      AND tm.user_id = auth.uid()
      AND tm.team_role = 'tech_lead'
  ))
  AND NOT EXISTS (
    SELECT 1 FROM timesheet_entries te
    JOIN timesheets ts ON te.timesheet_id = ts.id
    WHERE te.time_entry_id = time_entries.id
      AND ts.status IN ('submitted', 'approved')
  )
);