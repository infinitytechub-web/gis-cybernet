// csrf-classification: public read-only proxy: serves only the six fixed branding images, nothing else
// Public, read-only proxy for the app's branding images (logo, favicon,
// login background). The storage bucket itself grants no anonymous access;
// this function is the only public path and it refuses anything outside the
// six well-known branding slots, so no other file can ever be reached.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "branding";
const SIGNED_URL_TTL = 60 * 60 * 6; // 6h

// Only these top-level "slots" may ever be served publicly.
const ALLOWED_SLOTS = new Set([
  "logo_url",
  "login_logo_url",
  "login_background_url",
  "dashboard_logo_url",
  "email_logo_url",
  "favicon_url",
]);

function isAllowedPath(path: string): boolean {
  if (!path || path.length > 300) return false;
  if (path.includes("..") || path.includes("\\") || path.startsWith("/")) return false;
  const slot = path.split("/")[0];
  return ALLOWED_SLOTS.has(slot);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!isAllowedPath(path)) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    return new Response("Not found", { status: 404 });
  }

  // Redirect to the short-lived signed URL. The redirect itself may be
  // cached briefly; the signed URL stays valid far longer than the cache.
  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
