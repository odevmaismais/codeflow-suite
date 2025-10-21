-- RESET: Drop all existing policies on core tables
DROP POLICY IF EXISTS organizations_insert_policy ON public.organizations;
DROP POLICY IF EXISTS organizations_select_policy ON public.organizations;
DROP POLICY IF EXISTS organizations_update_policy ON public.organizations;
DROP POLICY IF EXISTS organizations_delete_policy ON public.organizations;
DROP POLICY IF EXISTS "Users can view organizations they belong to" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can soft delete their organizations" ON public.organizations;

DROP POLICY IF EXISTS user_orgs_select_own ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_select_policy ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_insert_policy ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_insert_any ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_update_policy ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_update_admin ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_delete_policy ON public.user_organizations;
DROP POLICY IF EXISTS user_orgs_delete_admin ON public.user_organizations;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Users can view memberships in their organizations" ON public.user_organizations;
DROP POLICY IF EXISTS "Users can create their own memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Admins and managers can add members" ON public.user_organizations;
DROP POLICY IF EXISTS "Admins can update memberships in their organizations" ON public.user_organizations;
DROP POLICY IF EXISTS "Admins can delete memberships in their organizations" ON public.user_organizations;

DROP POLICY IF EXISTS invites_select_members ON public.invite_codes;
DROP POLICY IF EXISTS invites_insert_admin ON public.invite_codes;
DROP POLICY IF EXISTS invites_update_creator ON public.invite_codes;
DROP POLICY IF EXISTS "Users can view invite codes from their organizations" ON public.invite_codes;
DROP POLICY IF EXISTS "Admins and managers can create invite codes" ON public.invite_codes;
DROP POLICY IF EXISTS "Creators and admins can update invite codes" ON public.invite_codes;

DROP POLICY IF EXISTS subs_select_members ON public.subscriptions;
DROP POLICY IF EXISTS subs_insert_system ON public.subscriptions;
DROP POLICY IF EXISTS subs_update_system ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view subscriptions for their organizations" ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_insert_policy ON public.subscriptions;

-- Ensure RLS enabled
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Helper function to bypass RLS for policy checks
CREATE OR REPLACE FUNCTION public.get_user_organizations(p_user_id uuid)
RETURNS TABLE (organization_id uuid, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id, role
  FROM public.user_organizations
  WHERE user_id = p_user_id;
$$;

-- STEP 1: user_organizations policies (dead simple)
CREATE POLICY user_orgs_select_own
  ON public.user_organizations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY user_orgs_insert_any
  ON public.user_organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY user_orgs_update_admin
  ON public.user_organizations FOR UPDATE
  USING (user_id = auth.uid() AND role = 'admin');

CREATE POLICY user_orgs_delete_admin
  ON public.user_organizations FOR DELETE
  USING (user_id = auth.uid() AND role = 'admin');

-- STEP 2: organizations policies using helper function
CREATE POLICY orgs_insert_any
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY orgs_select_members
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM public.get_user_organizations(auth.uid())
    )
  );

CREATE POLICY orgs_update_admin
  ON public.organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM public.get_user_organizations(auth.uid()) WHERE role = 'admin'
    )
  );

CREATE POLICY orgs_delete_admin
  ON public.organizations FOR DELETE
  USING (
    id IN (
      SELECT organization_id FROM public.get_user_organizations(auth.uid()) WHERE role = 'admin'
    )
  );

-- STEP 3: invite_codes policies (members/admins)
CREATE POLICY invites_select_members
  ON public.invite_codes FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.get_user_organizations(auth.uid())
    )
  );

CREATE POLICY invites_insert_admin
  ON public.invite_codes FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.get_user_organizations(auth.uid()) WHERE role IN ('admin','manager')
    )
  );

CREATE POLICY invites_update_creator
  ON public.invite_codes FOR UPDATE
  USING (
    created_by = auth.uid() OR organization_id IN (
      SELECT organization_id FROM public.get_user_organizations(auth.uid()) WHERE role = 'admin'
    )
  );

-- STEP 4: subscriptions policies
CREATE POLICY subs_select_members
  ON public.subscriptions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.get_user_organizations(auth.uid())
    )
  );

CREATE POLICY subs_insert_system
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY subs_update_system
  ON public.subscriptions FOR UPDATE
  USING (false);

-- STEP 5: SECURITY DEFINER functions for flows
DROP FUNCTION IF EXISTS public.create_organization_with_admin(text, text);
DROP FUNCTION IF EXISTS public.create_organization_with_admin(text, text, uuid);
CREATE OR REPLACE FUNCTION public.create_organization_with_admin(p_org_name TEXT, p_timezone TEXT, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
  v_org_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_org_name IS NULL OR char_length(btrim(p_org_name)) < 3 THEN
    RAISE EXCEPTION 'Organization name must be at least 3 characters';
  END IF;
  IF char_length(btrim(p_org_name)) > 50 THEN
    RAISE EXCEPTION 'Organization name must be at most 50 characters';
  END IF;
  IF p_timezone IS NULL OR p_timezone = '' THEN
    RAISE EXCEPTION 'Timezone is required';
  END IF;

  v_slug := generate_unique_slug(p_org_name);

  INSERT INTO public.organizations(name, slug, timezone)
  VALUES (btrim(p_org_name), v_slug, p_timezone)
  RETURNING id INTO v_org_id;

  INSERT INTO public.user_organizations(user_id, organization_id, role)
  VALUES (p_user_id, v_org_id, 'admin');

  INSERT INTO public.subscriptions(organization_id, plan, status)
  VALUES (v_org_id, 'free', 'active')
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN v_org_id;
END;
$$;

DROP FUNCTION IF EXISTS public.join_organization_with_code(text);
DROP FUNCTION IF EXISTS public.join_organization_via_invite(text, uuid);
CREATE OR REPLACE FUNCTION public.join_organization_via_invite(p_invite_code TEXT, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_org_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_invite_code IS NULL OR p_invite_code = '' THEN
    RAISE EXCEPTION 'Invite code is required';
  END IF;

  SELECT id, organization_id, used_count
  INTO v_invite
  FROM public.invite_codes
  WHERE code = upper(p_invite_code)
    AND is_active = true
    AND expires_at > now()
    AND (max_uses IS NULL OR used_count < max_uses)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  v_org_id := v_invite.organization_id;

  IF EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = p_user_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Already a member of this organization';
  END IF;

  INSERT INTO public.user_organizations(user_id, organization_id, role)
  VALUES (p_user_id, v_org_id, 'member');

  UPDATE public.invite_codes SET used_count = used_count + 1 WHERE id = v_invite.id;

  RETURN v_org_id;
END;
$$;