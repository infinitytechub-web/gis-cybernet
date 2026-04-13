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

    const results: any = {};

    // Test: Create with a gmail-like email
    console.log("Test: Auth user with unique email...");
    const testEmail = `test${Date.now()}@example.com`;
    const { data: u1, error: e1 } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: "TestPass123!",
      email_confirm: true,
      user_metadata: { staff_id: `__test_${Date.now()}`, first_name: "Test", last_name: "User" },
    });

    if (e1) {
      results.test_email = { error: e1.message, status: e1.status };
    } else {
      results.test_email = { success: true, userId: u1.user.id };
      // Check what profile was created
      const { data: profile } = await adminClient.from("profiles").select("*").eq("user_id", u1.user.id).single();
      results.profile_created = profile;
      
      // Cleanup
      await adminClient.from("profiles").delete().eq("user_id", u1.user.id);
      await adminClient.from("user_roles").delete().eq("user_id", u1.user.id);
      await adminClient.auth.admin.deleteUser(u1.user.id);
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
