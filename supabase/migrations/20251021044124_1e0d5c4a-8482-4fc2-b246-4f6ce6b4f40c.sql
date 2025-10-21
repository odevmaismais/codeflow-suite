-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 50),
  slug TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  default_work_hours_per_week INTEGER NOT NULL DEFAULT 40,
  timesheet_approval_enabled BOOLEAN NOT NULL DEFAULT false,
  timesheet_approver_role TEXT NOT NULL DEFAULT 'tech_lead',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Create index on slug for URL lookups
CREATE INDEX idx_organizations_slug ON public.organizations(slug) WHERE deleted_at IS NULL;

-- Create user_organizations junction table (many-to-many)
CREATE TABLE public.user_organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Create indexes for faster queries
CREATE INDEX idx_user_organizations_user_id ON public.user_organizations(user_id);
CREATE INDEX idx_user_organizations_org_id ON public.user_organizations(organization_id);
CREATE INDEX idx_user_organizations_role ON public.user_organizations(role);

-- Create invite_codes table
CREATE TABLE public.invite_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  used_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER
);

-- Create index on code for lookups
CREATE INDEX idx_invite_codes_code ON public.invite_codes(code) WHERE is_active = true;
CREATE INDEX idx_invite_codes_org ON public.invite_codes(organization_id);

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes on subscriptions
CREATE INDEX idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_org ON public.subscriptions(organization_id);

-- Enable Row Level Security
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations
CREATE POLICY "Users can view organizations they belong to"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = organizations.id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update their organizations"
  ON public.organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = organizations.id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role = 'admin'
    )
  );

CREATE POLICY "Admins can soft delete their organizations"
  ON public.organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = organizations.id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role = 'admin'
    )
  );

-- RLS Policies for user_organizations
CREATE POLICY "Users can view their own memberships"
  ON public.user_organizations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can view memberships in their organizations"
  ON public.user_organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.organization_id = user_organizations.organization_id
      AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own memberships"
  ON public.user_organizations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins and managers can add members"
  ON public.user_organizations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = user_organizations.organization_id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can remove members"
  ON public.user_organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.organization_id = user_organizations.organization_id
      AND uo.user_id = auth.uid()
      AND uo.role = 'admin'
    )
  );

-- RLS Policies for invite_codes
CREATE POLICY "Users can view invite codes from their organizations"
  ON public.invite_codes FOR SELECT
  USING (
    is_active = true 
    AND expires_at > now()
    AND (max_uses IS NULL OR used_count < max_uses)
  );

CREATE POLICY "Admins and managers can create invite codes"
  ON public.invite_codes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = invite_codes.organization_id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Creators and admins can update invite codes"
  ON public.invite_codes FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = invite_codes.organization_id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role = 'admin'
    )
  );

-- RLS Policies for subscriptions
CREATE POLICY "Users can view subscriptions for their organizations"
  ON public.subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = subscriptions.organization_id
      AND user_organizations.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to generate invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  -- Generate format: XXX-XXXXXX
  FOR i IN 1..3 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  result := result || '-';
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to create subscription on org creation
CREATE OR REPLACE FUNCTION create_subscription_for_org()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.subscriptions (organization_id, plan, status, trial_end)
  VALUES (NEW.id, 'free', 'active', now() + interval '14 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger to auto-create subscription
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION create_subscription_for_org();