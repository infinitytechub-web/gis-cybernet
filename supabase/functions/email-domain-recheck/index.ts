import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SENDER_DOMAIN = "notify.gis-cybernet.com";
const LOVABLE_API = "https://api.lovable.app";

interface DomainRecord {
  domain: string;
  status: string;
  last_checked_at: string;
  became_active_at: string | null;
  notified_active: boolean;
}

async function fetchLovableStatus(token: string): Promise<{ status: string; raw: any } | null> {
  // Use the Lovable email domains API; the project anon key authenticates.
  try {
    const res = await fetch(`${LOVABLE_API}/v1/email/domains/${encodeURIComponent(SENDER_DOMAIN)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      // Fallback: try to do a DNS lookup via dns.google for the SPF/MX TXT record
      const dnsRes = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(SENDER_DOMAIN)}&type=NS`,
      );
      if (dnsRes.ok) {
        const dns = await dnsRes.json();
        const hasNs = Array.isArray(dns.Answer) && dns.Answer.some((a: any) =>
          typeof a.data === "string" && a.data.toLowerCase().includes("lovable")
        );
        return { status: hasNs ? "active_provisioning" : "pending", raw: dns };
      }
      return null;
    }
    const data = await res.json();
    return { status: String(data.status ?? "pending"), raw: data };
  } catch (e) {
    console.error("fetchLovableStatus error", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Read previous state
  const { data: prev } = await admin
    .from("email_domain_status")
    .select("*")
    .eq("domain", SENDER_DOMAIN)
    .maybeSingle<DomainRecord>();

  const result = await fetchLovableStatus(anonKey);
  const newStatus = result?.status ?? "unknown";
  const isActive = newStatus === "active";
  const wasActive = prev?.status === "active";
  const nowIso = new Date().toISOString();

  const updateData: Record<string, any> = {
    domain: SENDER_DOMAIN,
    status: newStatus,
    last_checked_at: nowIso,
    last_error: result ? null : "Could not contact status API",
    updated_at: nowIso,
  };

  let notified = false;
  if (isActive && !wasActive) {
    updateData.became_active_at = nowIso;
    updateData.notified_active = true;
    // Notify admins (auto-enabling is automatic — sending resumes the moment status flips to active)
    try {
      await admin.rpc("notify_admins", {
        p_title: "Email Domain Active",
        p_message: `${SENDER_DOMAIN} is now verified. Email sending is enabled automatically.`,
        p_category: "system",
        p_actor: null,
      });
      notified = true;
    } catch (e) {
      console.error("notify_admins failed", e);
    }
  }

  await admin.from("email_domain_status").upsert(updateData, { onConflict: "domain" });

  return new Response(
    JSON.stringify({
      domain: SENDER_DOMAIN,
      previous_status: prev?.status ?? null,
      current_status: newStatus,
      transitioned_to_active: isActive && !wasActive,
      notified,
      checked_at: nowIso,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
});
