-- Create atomic org creation function that rolls back on any failure
CREATE OR REPLACE FUNCTION public.create_organization_atomic(p_user_id uuid, p_org_name text, p_timezone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_slug text;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_org_name IS NULL OR char_length(btrim(p_org_name)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization name must be at least 3 characters');
  END IF;
  IF char_length(btrim(p_org_name)) > 50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization name must be at most 50 characters');
  END IF;
  IF p_timezone IS NULL OR p_timezone = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Timezone is required');
  END IF;

  BEGIN
    -- All steps inside a subtransaction; any error rolls back these statements
    v_slug := generate_unique_slug(p_org_name);

    INSERT INTO public.organizations(name, slug, timezone)
    VALUES (btrim(p_org_name), v_slug, p_timezone)
    RETURNING id INTO v_org_id;

    INSERT INTO public.user_organizations(user_id, organization_id, role, joined_at)
    VALUES (p_user_id, v_org_id, 'admin', now());

    INSERT INTO public.subscriptions(organization_id, plan, status)
    VALUES (v_org_id, 'free', 'active')
    ON CONFLICT (organization_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'organization_id', v_org_id);
  EXCEPTION WHEN OTHERS THEN
    -- Nothing persisted from the BEGIN...EXCEPTION block; return error
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$;