// Read the machine-readable zone (MRZ) off a photo of a Ghana Card or passport.
//
// The image is sent to the Lovable AI gateway vision model, which transcribes
// only the MRZ lines. All parsing, check-digit validation and storage happen on
// the client/database side (src/lib/mrz.ts) — this function returns raw text.
// Signed-in callers only; images are never stored here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cybernet-app",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PROMPT = `You are a document reader. The image shows an identity document
(Ghana Card, ECOWAS ID or passport). Transcribe ONLY the machine-readable zone
(MRZ): the block of monospaced lines at the bottom made of A-Z, 0-9 and < filler
characters.

Rules:
- Return the MRZ lines exactly as printed, one per line, uppercase, no spaces.
- A passport MRZ has 2 lines of 44 characters. An ID card MRZ has 3 lines of 30.
- Preserve every < character and pad the line to its full length if needed.
- Never guess or invent characters. If no MRZ is visible, return exactly: NO_MRZ
- Output the lines only. No explanation, no code fences, no labels.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const image = typeof body?.image === "string" ? body.image : "";
    if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
      return json({ error: "Send the document as a base64 image data URL" }, 400);
    }
    // ~8MB of base64 keeps the request well inside gateway limits.
    if (image.length > 8_000_000) return json({ error: "Image too large" }, 413);

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "Document reader is not configured" }, 500);

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        }],
      }),
    });

    if (ai.status === 429) return json({ error: "The reader is busy — try again in a moment" }, 429);
    if (ai.status === 402) return json({ error: "Document reading credits are exhausted" }, 402);
    if (!ai.ok) {
      console.error("mrz gateway error", ai.status, await ai.text());
      return json({ error: "The document could not be read" }, 502);
    }

    const out = await ai.json();
    const text: string = out?.choices?.[0]?.message?.content ?? "";
    const lines = text
      .replace(/```[a-z]*/gi, "")
      .split(/\r?\n/)
      .map((l) => l.trim().toUpperCase().replace(/\s+/g, ""))
      .filter((l) => /^[A-Z0-9<]{20,50}$/.test(l));

    if (!lines.length || /NO_MRZ/i.test(text)) {
      return json({ mrz: null, reason: "no_mrz" });
    }
    return json({ mrz: lines.join("\n") });
  } catch (e) {
    console.error("read-mrz failed", e);
    return json({ error: "The document could not be read" }, 500);
  }
});
