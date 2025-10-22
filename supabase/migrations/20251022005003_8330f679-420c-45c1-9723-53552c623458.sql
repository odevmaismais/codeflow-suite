-- Add missing columns to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- Create indexes for Stripe IDs
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  amount_due INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  invoice_pdf TEXT,
  hosted_invoice_url TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe ON invoices(stripe_invoice_id);

-- Enable RLS on invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- RLS policy for invoices (admin only)
CREATE POLICY invoices_select_admin ON invoices
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM get_user_organizations(auth.uid())
    WHERE role IN ('admin', 'manager')
  )
);

-- Function: check_subscription_limit
CREATE OR REPLACE FUNCTION check_subscription_limit(p_org_id UUID, p_resource_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_status TEXT;
  v_count INTEGER;
BEGIN
  -- Get subscription details
  SELECT plan, status INTO v_plan, v_status
  FROM subscriptions
  WHERE organization_id = p_org_id;
  
  -- Must be active or trialing
  IF v_status NOT IN ('active', 'trialing') THEN
    RETURN false;
  END IF;
  
  -- Pro plan has no limits
  IF v_plan = 'pro' THEN
    RETURN true;
  END IF;
  
  -- Free plan limits
  IF p_resource_type = 'team' THEN
    SELECT COUNT(*) INTO v_count
    FROM teams
    WHERE organization_id = p_org_id AND deleted_at IS NULL;
    RETURN v_count < 1;
    
  ELSIF p_resource_type = 'project' THEN
    SELECT COUNT(*) INTO v_count
    FROM projects
    WHERE organization_id = p_org_id AND deleted_at IS NULL;
    RETURN v_count < 3;
    
  ELSIF p_resource_type = 'time_entry' THEN
    SELECT COUNT(*) INTO v_count
    FROM time_entries
    WHERE organization_id = p_org_id 
      AND deleted_at IS NULL
      AND start_time >= date_trunc('month', NOW());
    RETURN v_count < 100;
    
  ELSE
    RETURN true;
  END IF;
END;
$$;

-- Function: get_subscription_usage
CREATE OR REPLACE FUNCTION get_subscription_usage(p_org_id UUID)
RETURNS TABLE(
  team_count BIGINT,
  project_count BIGINT,
  task_count BIGINT,
  time_entry_count_month BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM teams WHERE organization_id = p_org_id AND deleted_at IS NULL) AS team_count,
    (SELECT COUNT(*) FROM projects WHERE organization_id = p_org_id AND deleted_at IS NULL) AS project_count,
    (SELECT COUNT(*) FROM tasks WHERE organization_id = p_org_id AND deleted_at IS NULL) AS task_count,
    (SELECT COUNT(*) FROM time_entries WHERE organization_id = p_org_id AND deleted_at IS NULL AND start_time >= date_trunc('month', NOW())) AS time_entry_count_month;
$$;

-- Function: start_trial
CREATE OR REPLACE FUNCTION start_trial(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_start TIMESTAMPTZ;
BEGIN
  -- Check if already trialed
  SELECT trial_start INTO v_trial_start
  FROM subscriptions
  WHERE organization_id = p_org_id;
  
  IF v_trial_start IS NOT NULL THEN
    RETURN false; -- Already trialed
  END IF;
  
  -- Start trial
  UPDATE subscriptions
  SET 
    status = 'trialing',
    plan = 'pro',
    trial_start = NOW(),
    trial_end = NOW() + INTERVAL '14 days'
  WHERE organization_id = p_org_id;
  
  RETURN true;
END;
$$;

-- Function: end_trial
CREATE OR REPLACE FUNCTION end_trial(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_stripe_sub TEXT;
BEGIN
  SELECT plan, stripe_subscription_id INTO v_plan, v_stripe_sub
  FROM subscriptions
  WHERE organization_id = p_org_id;
  
  -- If already upgraded to paid Pro, don't downgrade
  IF v_plan = 'pro' AND v_stripe_sub IS NOT NULL THEN
    RETURN false;
  END IF;
  
  -- Downgrade to Free
  UPDATE subscriptions
  SET 
    status = 'active',
    plan = 'free'
  WHERE organization_id = p_org_id;
  
  RETURN true;
END;
$$;