-- Fix search_path security warnings on all SECURITY DEFINER functions
-- Add pg_temp to prevent privilege escalation attacks

-- Fix reset_database_for_org
DROP FUNCTION IF EXISTS public.reset_database_for_org(UUID);
CREATE OR REPLACE FUNCTION public.reset_database_for_org(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- Fix log_audit_event_trigger
DROP FUNCTION IF EXISTS public.log_audit_event_trigger() CASCADE;
CREATE OR REPLACE FUNCTION public.log_audit_event_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id UUID;
  v_old_vals JSONB;
  v_new_vals JSONB;
  v_record_id UUID;
  v_ip_address INET;
  v_user_agent TEXT;
BEGIN
  -- Extract organization_id and record_id
  IF TG_OP = 'DELETE' THEN
    v_org_id := OLD.organization_id;
    v_old_vals := public.redact_sensitive_fields(to_jsonb(OLD));
    v_new_vals := NULL;
    v_record_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    v_org_id := NEW.organization_id;
    v_old_vals := NULL;
    v_new_vals := public.redact_sensitive_fields(to_jsonb(NEW));
    v_record_id := NEW.id;
  ELSE -- UPDATE
    v_org_id := NEW.organization_id;
    v_old_vals := public.redact_sensitive_fields(to_jsonb(OLD));
    v_new_vals := public.redact_sensitive_fields(to_jsonb(NEW));
    v_record_id := NEW.id;
  END IF;

  -- Try to capture IP address and user agent (may be NULL if not set)
  BEGIN
    v_ip_address := NULLIF(current_setting('request.headers', true)::json->>'x-forwarded-for', '')::INET;
  EXCEPTION WHEN OTHERS THEN
    v_ip_address := NULL;
  END;

  BEGIN
    v_user_agent := current_setting('request.headers', true)::json->>'user-agent';
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := NULL;
  END;

  -- Insert audit log
  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    ip_address,
    user_agent
  ) VALUES (
    v_org_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old_vals,
    v_new_vals,
    v_ip_address,
    v_user_agent
  );

  RETURN NULL;
END;
$$;