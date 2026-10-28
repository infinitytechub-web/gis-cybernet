// Scans a Holding Center upload with Cloudmersive and records the verdict.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const Body = z.object({
  kind: z.enum(["document", "surety", "mugshot"]),
  id: z.string().uuid(),
});
const TARGET = {
  document: { table: "suspect_documents", path: "file_path", status: "scan_status" },
  surety: { table: "detention_sureties", path: "photo_path", status: "scan_status" },
  mugshot: { table: "detention_records", path: "mugshot_url", status: "mugshot_scan_status" },
} as const;
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await user.auth.getUser();
    if (!u?.user) return json({ error: "Not signed in" }, 401);
    const { data: allowed } = await user.rpc("can_access_detention", { _uid: u.user.id });
    if (!allowed) return json({ error: "Not authorised" }, 403);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const t = TARGET[parsed.data.kind];

    // Caller must be able to read the row under RLS.
    const { data: row } = await user.from(t.table).select(`${t.path}`).eq("id", parsed.data.id).maybeSingle();
    const path = (row as Record<string, string | null> | null)?.[t.path];
    if (!path) return json({ error: "File not found" }, 404);

    const key = Deno.env.get("CLOUDMERSIVE_API_KEY");
    if (!key) return json({ status: "pending", error: "Virus scanner is not configured" }, 503);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: file, error: dlErr } = await admin.storage.from("detention-photos").download(path);
    if (dlErr || !file) return json({ error: "Could not read file" }, 500);

    const fd = new FormData();
    fd.append("inputFile", file, path.split("/").pop() ?? "upload");
    const res = await fetch("https://api.cloudmersive.com/virus/scan/file", { method: "POST", headers: { Apikey: key }, body: fd });
    if (!res.ok) return json({ status: "pending", error: `Scanner error ${res.status}` }, 502);
    const verdict = await res.json() as { CleanResult?: boolean; FoundViruses?: { VirusName?: string }[] | null };
    const status = verdict.CleanResult === true ? "safe" : "infected";

    await admin.from(t.table).update({ [t.status]: status }).eq("id", parsed.data.id);
    if (status === "infected") {
      await admin.storage.from("detention-photos").remove([path]);
      await admin.from("firewall_events").insert({
        layer: "file", action: "quarantine", subject: path, actor_id: u.user.id,
        details: { scanner: "cloudmersive", viruses: (verdict.FoundViruses ?? []).map((v) => v.VirusName) },
      }).then(() => {}, () => {});
    }
    return json({ status });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
