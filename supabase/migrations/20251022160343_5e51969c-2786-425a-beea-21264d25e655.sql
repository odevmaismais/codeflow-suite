-- Create function to safely truncate all tables (admin only)
CREATE OR REPLACE FUNCTION public.reset_database_for_org(p_org_id UUID)
RETURNS TEXT AS $$
BEGIN
  -- Only allow if user is admin of the organization
  IF NOT EXISTS (
    SELECT 1 FROM get_user_organizations(auth.uid())
    WHERE organization_id = p_org_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can reset the database';
  END IF;

  -- Delete all data for this organization (cascade will handle related records)
  DELETE FROM public.audit_logs WHERE organization_id = p_org_id;
  DELETE FROM public.task_watchers WHERE task_id IN (SELECT id FROM public.tasks WHERE organization_id = p_org_id);
  DELETE FROM public.task_attachments WHERE task_id IN (SELECT id FROM public.tasks WHERE organization_id = p_org_id);
  DELETE FROM public.task_comments WHERE task_id IN (SELECT id FROM public.tasks WHERE organization_id = p_org_id);
  DELETE FROM public.tasks WHERE organization_id = p_org_id;
  DELETE FROM public.timesheet_entries WHERE timesheet_id IN (SELECT id FROM public.timesheets WHERE organization_id = p_org_id);
  DELETE FROM public.timesheets WHERE organization_id = p_org_id;
  DELETE FROM public.time_entries WHERE organization_id = p_org_id;
  DELETE FROM public.pomodoro_sessions WHERE user_id IN (SELECT user_id FROM public.user_organizations WHERE organization_id = p_org_id);
  DELETE FROM public.project_teams WHERE project_id IN (SELECT id FROM public.projects WHERE organization_id = p_org_id);
  DELETE FROM public.projects WHERE organization_id = p_org_id;
  DELETE FROM public.team_members WHERE team_id IN (SELECT id FROM public.teams WHERE organization_id = p_org_id);
  DELETE FROM public.teams WHERE organization_id = p_org_id;
  DELETE FROM public.invoices WHERE organization_id = p_org_id;
  DELETE FROM public.invite_codes WHERE organization_id = p_org_id;

  RETURN 'Database reset successfully for organization';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;