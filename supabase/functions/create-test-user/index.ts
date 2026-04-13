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

    // Test 1: Try inserting directly into profiles to test trigger chain
    console.log("Test 1: Direct profile insert...");
    const { data: p1, error: e1 } = await adminClient.from("profiles").insert({
      staff_id: "__test_trigger_chain_001",
      first_name: "Trigger",
      last_name: "Test",
    }).select().single();
    
    if (e1) {
      console.log("Profile insert failed:", e1.message, e1.details, e1.hint);
      return new Response(JSON.stringify({ test1_error: e1 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("Profile insert succeeded, cleaning up...");
    // Clean up
    await adminClient.from("profiles").delete().eq("id", p1.id);

    // Test 2: Try creating auth user with NO metadata
    console.log("Test 2: Auth user with no metadata...");
    const { data: u2, error: e2 } = await adminClient.auth.admin.createUser({
      email: "test.nometa999@gis.local",
      password: "TestPass123!",
      email_confirm: true,
    });

    if (e2) {
      return new Response(JSON.stringify({ test1: "ok", test2_error: e2.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean up
    await adminClient.from("profiles").delete().eq("user_id", u2.user.id);
    await adminClient.from("user_roles").delete().eq("user_id", u2.user.id);
    await adminClient.auth.admin.deleteUser(u2.user.id);

    return new Response(JSON.stringify({ test1: "ok", test2: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
