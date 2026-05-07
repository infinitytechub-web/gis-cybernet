// supabase/functions/refresh-threat-feeds/index.ts
// Daily-scheduled job: pull external threat lists into firewall_threat_entries.
// No API keys required — sources are public text feeds.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BATCH = 50;

interface FeedRow {
  id: string;
  slug: string;
  source_url: string;
  is_enabled: boolean;
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function fetchFeed(url: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Cybernet-Firewall/1.0 (+gis.local)" },
  });
  if (!res.ok) throw new Error(`feed fetch ${res.status}`);
  const text = await res.text();
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

async function upsertEntries(
  admin: ReturnType<typeof createClient>,
  feedId: string,
  rows: { kind: string; value: string; severity: string }[],
) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH).map((r) => ({
      feed_id: feedId,
      kind: r.kind,
      value: r.value,
      severity: r.severity,
    }));
    const { error } = await admin
      .from("firewall_threat_entries")
      .upsert(slice, { onConflict: "feed_id,kind,value", ignoreDuplicates: true });
    if (!error) inserted += slice.length;
  }
  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isInternalCaller(req)) return unauthorizedResponse(corsHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRole);

  try {
    // Honour global toggle
    const { data: settings } = await admin
      .from("firewall_settings")
      .select("feed_refresh_enabled, is_enabled")
      .limit(1)
      .maybeSingle();
    if (!settings?.is_enabled || !settings?.feed_refresh_enabled) {
      return new Response(JSON.stringify({ skipped: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: feeds, error } = await admin
      .from("firewall_threat_feeds")
      .select("id, slug, source_url, is_enabled")
      .eq("is_enabled", true);
    if (error) throw error;

    const summary: Record<string, { count: number; status: string }> = {};

    for (const feed of (feeds ?? []) as FeedRow[]) {
      try {
        const lines = await fetchFeed(feed.source_url);
        // Treat each line as a full URL; record both url_full and url_domain.
        const entries: { kind: string; value: string; severity: string }[] = [];
        const seen = new Set<string>();
        for (const line of lines) {
          // skip header-style lines
          if (!/^https?:\/\//i.test(line)) continue;
          const v = line.toLowerCase();
          if (!seen.has("u" + v)) {
            entries.push({ kind: "url_full", value: v, severity: "high" });
            seen.add("u" + v);
          }
          const d = extractDomain(line);
          if (d && !seen.has("d" + d)) {
            entries.push({ kind: "url_domain", value: d, severity: "high" });
            seen.add("d" + d);
          }
        }

        // Replace this feed's entries with the freshly pulled set.
        await admin.from("firewall_threat_entries").delete().eq("feed_id", feed.id);
        const inserted = await upsertEntries(admin, feed.id, entries);

        await admin.from("firewall_threat_feeds").update({
          last_refreshed_at: new Date().toISOString(),
          last_status: "ok",
          last_entry_count: inserted,
        }).eq("id", feed.id);

        summary[feed.slug] = { count: inserted, status: "ok" };
      } catch (e) {
        await admin.from("firewall_threat_feeds").update({
          last_refreshed_at: new Date().toISOString(),
          last_status: `error: ${(e as Error).message}`.slice(0, 200),
        }).eq("id", feed.id);
        summary[feed.slug] = { count: 0, status: "error" };
      }
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
