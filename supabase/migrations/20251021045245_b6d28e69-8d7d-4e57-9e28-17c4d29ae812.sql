-- STEP 0: Clean up conflicting triggers/policies
DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
DROP FUNCTION IF EXISTS create_subscription_for_org();

-- Drop existing organizations policies
DROP POLICY IF EXISTS "Users can view organizations they belong to" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can soft delete their organizations" ON public.organizations;
DROP POLICY IF EXISTS organizations_insert_policy ON public.organizations;
DROP POLICY IF EXISTS organizations_select_policy ON public.organizations;
DROP POLICY IF EXISTS organizations_update_policy ON public.organizations;
DROP POLICY IF EXISTS organizations_delete_policy ON public.organizations;

-- Drop existing user_organizations policies
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Users can view memberships in their organizations" ON public.user_organizations;
DROP POLICY IF EXISTS "Users can create their own memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Admins and managers can add members" ON public.user_organizations;
DROP POLICY IF EXISTS "Admins can update memberships in their organizations" ON public.user_organizations;
DROP POLICY IF EXISTS "Admins can delete memberships in their organizations" ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_select_policy ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_select_own ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_insert_policy ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_update_policy ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_delete_policy ON public.user_organizations;

-- Ensure RLS is enabled
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- STEP 1: Organizations policies (exact as requested)
CREATE POLICY organizations_insert_policy
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY organizations_select_policy
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = organizations.id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY organizations_update_policy
  ON public.organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = organizations.id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role = 'admin'
    )
  );

CREATE POLICY organizations_delete_policy
  ON public.organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = organizations.id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role = 'admin'
    )
  );

-- STEP 2: user_organizations policies
-- Base SELECT (simple, avoids recursion)
CREATE POLICY user_orgs_select_own
  ON public.user_organizations FOR SELECT
  USING (user_id = auth.uid());

-- Additional SELECT to see other members of same org (safe due to base policy)
CREATE POLICY user_orgs_select_policy
  ON public.user_organizations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
    )
  );

-- INSERT allowed for authenticated users (for org creation and invites)
CREATE POLICY user_orgs_insert_policy
  ON public.user_organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE allowed for admins in the same org
CREATE POLICY user_orgs_update_policy
  ON public.user_organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.organization_id = user_organizations.organization_id
      AND uo.user_id = auth.uid()
      AND uo.role = 'admin'
    )
  );

-- DELETE allowed for admins in the same org
CREATE POLICY user_orgs_delete_policy
  ON public.user_organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.organization_id = user_organizations.organization_id
      AND uo.user_id = auth.uid()
      AND uo.role = 'admin'
    )
  );

-- STEP 2.5: Subscriptions insert policy to allow creation after membership
DROP POLICY IF EXISTS subscriptions_insert_policy ON public.subscriptions;
CREATE POLICY subscriptions_insert_policy
  ON public.subscriptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.organization_id = subscriptions.organization_id
      AND uo.user_id = auth.uid()
    )
  );

-- STEP 3: Create transactional functions for org creation and invite join

-- Create organization with admin & subscription (single call)
CREATE OR REPLACE FUNCTION public.create_organization_with_admin(p_name TEXT, p_timezone TEXT)
RETURNS TABLE (id UUID, name TEXT, slug TEXT, timezone TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
  v_org public.organizations%ROWTYPE;
BEGIN
  IF p_name IS NULL OR char_length(btrim(p_name)) < 3 THEN
    RAISE EXCEPTION 'Organization name must be at least 3 characters';
  END IF;
  IF char_length(btrim(p_name)) > 50 THEN
    RAISE EXCEPTION 'Organization name must be at most 50 characters';
  END IF;
  IF p_timezone IS NULL OR p_timezone = '' THEN
    RAISE EXCEPTION 'Timezone is required';
  END IF;

  v_slug := generate_unique_slug(p_name);

  INSERT INTO public.organizations(name, slug, timezone)
  VALUES (btrim(p_name), v_slug, p_timezone)
  RETURNING * INTO v_org;

  -- Add creator as admin
  INSERT INTO public.user_organizations(user_id, organization_id, role)
  VALUES (auth.uid(), v_org.id, 'admin');

  -- Create subscription (now allowed since membership exists)
  INSERT INTO public.subscriptions(organization_id, plan, status)
  VALUES (v_org.id, 'free', 'active')
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN QUERY SELECT v_org.id, v_org.name, v_org.slug, v_org.timezone;
END;
$$;

-- Join organization via invite code (validates & increments usage)
CREATE OR REPLACE FUNCTION public.join_organization_with_code(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.invite_codes%ROWTYPE;
BEGIN
  IF p_code IS NULL OR p_code = '' THEN
    RAISE EXCEPTION 'Invite code is required';
  END IF;

  SELECT * INTO v_invite
  FROM public.invite_codes
  WHERE code = upper(p_code)
    AND is_active = true
    AND expires_at > now()
    AND (max_uses IS NULL OR used_count < max_uses)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  -- Ensure not already a member
  IF EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid() AND organization_id = v_invite.organization_id
  ) THEN
    RAISE EXCEPTION 'Already a member of this organization';
  END IF;

  -- Add as member
  INSERT INTO public.user_organizations(user_id, organization_id, role)
  VALUES (auth.uid(), v_invite.organization_id, 'member');

  -- Increment usage
  UPDATE public.invite_codes
  SET used_count = used_count + 1
  WHERE id = v_invite.id;

  RETURN v_invite.organization_id;
END;
$$;