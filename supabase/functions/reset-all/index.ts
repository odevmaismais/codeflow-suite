import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing backend configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { orgId } = await req.json();
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'orgId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Client to read the caller user from the JWT
    const supabaseAuthClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Validate caller is authenticated
    const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;

    // Ensure caller is admin of the organization
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('user_organizations')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (membershipError || !membership || membership.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all user ids in the organization BEFORE deleting links
    const { data: members, error: membersError } = await supabaseAdmin
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', orgId);

    if (membersError) {
      return new Response(JSON.stringify({ error: membersError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // First, call existing DB function to clear all org data (children tables)
    // IMPORTANT: Call with the authenticated user's context so auth.uid() works inside the function
    const { error: resetError } = await supabaseAuthClient.rpc('reset_database_for_org', {
      p_org_id: orgId,
    });
    if (resetError) {
      return new Response(JSON.stringify({ error: resetError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Then remove remaining org-level records
    await supabaseAdmin.from('subscriptions').delete().eq('organization_id', orgId);
    await supabaseAdmin.from('user_organizations').delete().eq('organization_id', orgId);
    await supabaseAdmin.from('organizations').delete().eq('id', orgId);

    // Finally, delete auth users for that org
    let deletedUsers = 0;
    if (Array.isArray(members)) {
      for (const m of members) {
        // Best-effort: ignore errors to continue deleting other users
        const resp = await supabaseAdmin.auth.admin.deleteUser(m.user_id);
        if (!resp.error) deletedUsers += 1;
      }
    }

    return new Response(
      JSON.stringify({ success: true, orgId, deletedUsers }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('reset-all error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
