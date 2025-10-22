-- ================================================
-- PHASE 7: AUDIT LOGS - IMMUTABLE COMPLIANCE TRACKING
-- ================================================

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON public.audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ================================================
-- IMMUTABILITY ENFORCEMENT
-- ================================================

-- Function to prevent modifications to audit logs
CREATE OR REPLACE FUNCTION public.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

-- Triggers to enforce immutability
CREATE TRIGGER prevent_audit_log_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_modification();

CREATE TRIGGER prevent_audit_log_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_modification();

-- ================================================
-- SENSITIVE DATA REDACTION
-- ================================================

-- Function to redact sensitive fields from JSONB
CREATE OR REPLACE FUNCTION public.redact_sensitive_fields(p_values JSONB)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_key TEXT;
  v_sensitive_fields TEXT[] := ARRAY[
    'password', 'token', 'api_key', 'secret', 
    'stripe_secret_key', 'stripe_webhook_secret', 
    'credit_card', 'stripe_customer_id', 'stripe_subscription_id',
    'stripe_price_id', 'stripe_invoice_id'
  ];
BEGIN
  IF p_values IS NULL THEN
    RETURN NULL;
  END IF;

  v_result := p_values;
  
  FOREACH v_key IN ARRAY v_sensitive_fields LOOP
    IF v_result ? v_key THEN
      v_result := jsonb_set(v_result, ARRAY[v_key], '"[REDACTED]"'::jsonb);
    END IF;
  END LOOP;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ================================================
-- AUDIT LOGGING TRIGGER FUNCTION
-- ================================================

CREATE OR REPLACE FUNCTION public.log_audit_event_trigger()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ================================================
-- APPLY AUDIT TRIGGERS TO ALL TABLES
-- ================================================

-- Tasks table
CREATE TRIGGER audit_tasks_insert
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_tasks_update
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_tasks_delete
  AFTER DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

-- Time entries table
CREATE TRIGGER audit_time_entries_insert
  AFTER INSERT ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_time_entries_update
  AFTER UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_time_entries_delete
  AFTER DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

-- Projects table
CREATE TRIGGER audit_projects_insert
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_projects_update
  AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_projects_delete
  AFTER DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

-- Teams table
CREATE TRIGGER audit_teams_insert
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_teams_update
  AFTER UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_teams_delete
  AFTER DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

-- Timesheets table
CREATE TRIGGER audit_timesheets_insert
  AFTER INSERT ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_timesheets_update
  AFTER UPDATE ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_timesheets_delete
  AFTER DELETE ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

-- Subscriptions table
CREATE TRIGGER audit_subscriptions_insert
  AFTER INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_subscriptions_update
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_subscriptions_delete
  AFTER DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

-- Organizations table
CREATE TRIGGER audit_organizations_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_organizations_update
  AFTER UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_organizations_delete
  AFTER DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

-- User organizations table
CREATE TRIGGER audit_user_organizations_insert
  AFTER INSERT ON public.user_organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_user_organizations_update
  AFTER UPDATE ON public.user_organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

CREATE TRIGGER audit_user_organizations_delete
  AFTER DELETE ON public.user_organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event_trigger();

-- ================================================
-- ROW LEVEL SECURITY POLICIES
-- ================================================

-- SELECT: Admins see all org logs, members see only their own
CREATE POLICY audit_logs_select_admin ON public.audit_logs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM get_user_organizations(auth.uid()) 
      WHERE role IN ('admin', 'manager')
    )
    OR user_id = auth.uid()
  );

-- INSERT: System only (via triggers)
CREATE POLICY audit_logs_insert_system ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM get_user_organizations(auth.uid())
    )
  );

-- No UPDATE or DELETE policies (immutable)