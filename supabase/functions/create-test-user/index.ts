import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Try creating a single test user
    const { data, error } = await adminClient.auth.admin.createUser({
      email: "test.debug999@gis.local",
      password: "TestPass123!",
      email_confirm: true,
      user_metadata: {
        first_name: "Test",
        last_name: "Debug",
        staff_id: "__tmp_TEST-DEBUG-999",
        must_change_password: true,
      },
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message, code: error.status, details: JSON.stringify(error) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean up
    const userId = data.user.id;
    await adminClient.from("profiles").delete().eq("user_id", userId);
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    await adminClient.auth.admin.deleteUser(userId);

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
