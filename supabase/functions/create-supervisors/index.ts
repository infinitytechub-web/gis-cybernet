import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supervisors = [
  { staff_id: "GIS-ASC-0001", first_name: "JOYCE", last_name: "SACKEY", profile_id: "aeb102d9-85c2-4604-bcd2-82220a861a8d" },
  { staff_id: "GIS-ASC-0002", first_name: "FELIX", last_name: "ACQUAH DEI", profile_id: "f143aee7-f4c2-4dc2-b75b-3e2da948aa20" },
  { staff_id: "GIS-ASC-0006", first_name: "VERINA", last_name: "MARIAM ABLEKPE", profile_id: "b584ea43-ac2a-4280-93a5-8512392d5953" },
  { staff_id: "GIS-ASC-0065", first_name: "HAWAWU", last_name: "ABDUL-SALAM", profile_id: "eb4867fe-d6b7-43ea-8f0a-379b9b44673e" },
  { staff_id: "GIS-ASC-0066", first_name: "SELINA", last_name: "IMORO", profile_id: "d57dee4b-a2b1-4ba7-8876-17cfaf0862b5" },
  { staff_id: "GIS-ASC-0068", first_name: "LAWRENCIA", last_name: "SAFOAH", profile_id: "87119760-502b-492d-a788-e511bee52e68" },
  { staff_id: "GIS-ASC-0129", first_name: "AKOSUA", last_name: "YEBOAH", profile_id: "33b9beb8-1036-427a-a284-1ed63b9579c7" },
  { staff_id: "GIS-ASC-0131", first_name: "ABIGAIL", last_name: "ADWAPA BAAH", profile_id: "2807c21b-3f65-4b94-a9e9-ce234a1cf4a5" },
  { staff_id: "GIS-ASC-0133", first_name: "PATIENCE", last_name: "ADONTENG", profile_id: "36dbb2b1-22af-4f6f-bab6-910434420cfd" },
  { staff_id: "GIS-ASC-0194", first_name: "BERNARD", last_name: "BADU BOATENG", profile_id: "a6a5d768-c170-488b-bf02-2673e2aac701" },
  { staff_id: "GIS-ASC-0196", first_name: "EMMANUEL", last_name: "OPOKU SARPONG", profile_id: "8d3e25cf-bf17-491e-9539-b81d22563b0e" },
  { staff_id: "GIS-ASC-0201", first_name: "AGYAA", last_name: "KATE", profile_id: "4b3215a5-efad-4751-b5ee-de60238604d3" },
];

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: Array<{ staff_id: string; status: string; email?: string }> = [];
  const defaultPassword = "Supervisor@2026";

  for (const sup of supervisors) {
    const email = `${sup.staff_id.toLowerCase().replace(/-/g, "")}@gis.local`;

    try {
      // Check if user already exists
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const existing = users?.find((u) => u.email === email);

      let userId: string;

      if (existing) {
        userId = existing.id;
        // Reset password
        await supabase.auth.admin.updateUserById(userId, { password: defaultPassword });
        results.push({ staff_id: sup.staff_id, status: "existing - password reset", email });
      } else {
        // Create new auth user
        const { data: newUser, error } = await supabase.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: {
            staff_id: sup.staff_id,
            first_name: sup.first_name,
            last_name: sup.last_name,
          },
        });

        if (error) {
          results.push({ staff_id: sup.staff_id, status: `error: ${error.message}` });
          continue;
        }
        userId = newUser.user!.id;
        results.push({ staff_id: sup.staff_id, status: "created", email });
      }

      // Link profile to auth user
      await supabase
        .from("profiles")
        .update({ user_id: userId })
        .eq("id", sup.profile_id);

      // Set supervisor role (upsert to avoid duplicates)
      // First delete any existing role for this user
      await supabase.from("user_roles").delete().eq("user_id", userId);
      // Then insert supervisor role
      await supabase.from("user_roles").insert({ user_id: userId, role: "supervisor" });

    } catch (err) {
      results.push({ staff_id: sup.staff_id, status: `exception: ${String(err)}` });
    }
  }

  return new Response(JSON.stringify({
    message: `Processed ${results.length} supervisors`,
    default_password: defaultPassword,
    results,
  }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
