-- Create function to get tasks with user details
CREATE OR REPLACE FUNCTION public.get_tasks_with_details(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  project_id UUID,
  parent_task_id UUID,
  code TEXT,
  title TEXT,
  description TEXT,
  status TEXT,
  priority TEXT,
  task_type TEXT,
  assigned_to UUID,
  created_by UUID,
  estimated_hours NUMERIC,
  actual_hours NUMERIC,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  assignee_email TEXT,
  assignee_name TEXT,
  creator_email TEXT,
  creator_name TEXT,
  project_name TEXT,
  subtask_count BIGINT,
  completed_subtask_count BIGINT,
  comment_count BIGINT,
  attachment_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.organization_id,
    t.project_id,
    t.parent_task_id,
    t.code,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.task_type,
    t.assigned_to,
    t.created_by,
    t.estimated_hours,
    t.actual_hours,
    t.due_date,
    t.completed_at,
    t.created_at,
    t.updated_at,
    t.deleted_at,
    assignee.email::TEXT as assignee_email,
    (assignee.raw_user_meta_data->>'full_name')::TEXT as assignee_name,
    creator.email::TEXT as creator_email,
    (creator.raw_user_meta_data->>'full_name')::TEXT as creator_name,
    p.name::TEXT as project_name,
    (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.deleted_at IS NULL) as subtask_count,
    (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.status = 'done' AND st.deleted_at IS NULL) as completed_subtask_count,
    (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.deleted_at IS NULL) as comment_count,
    (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id AND ta.deleted_at IS NULL) as attachment_count
  FROM tasks t
  LEFT JOIN auth.users assignee ON t.assigned_to = assignee.id
  LEFT JOIN auth.users creator ON t.created_by = creator.id
  LEFT JOIN projects p ON t.project_id = p.id
  WHERE t.organization_id = p_org_id
    AND t.deleted_at IS NULL
    AND t.parent_task_id IS NULL
  ORDER BY t.created_at DESC;
END;
$$;