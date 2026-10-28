import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export async function verifyAndSignApproval(password: string, args: { _workflow: string; _record_id: string; _tier: number; _decision: string; _comments: string }) {
  const current = await supabase.auth.getUser();
  if (current.error || !current.data.user?.email) throw new Error("Sign in to your staff account first.");
  const verified = createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const result = await verified.auth.signInWithPassword({ email: current.data.user.email, password });
    if (result.error || !result.data.session || result.data.user?.id !== current.data.user.id) throw new Error("Password verification failed. No signature was saved.");
    const signed = await verified.rpc("sign_approval", { ...args, _signer_name: "" });
    if (signed.error) throw new Error(signed.error.message);
    return signed.data;
  } finally {
    await verified.auth.signOut({ scope: "local" });
  }
}