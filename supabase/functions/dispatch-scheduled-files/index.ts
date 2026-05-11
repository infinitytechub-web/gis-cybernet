import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pick due deliveries
    const { data: due, error: dueErr } = await supabase
      .from("scheduled_file_deliveries")
      .select("id, sender_id, title, message, file_path, file_name")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(50);

    if (dueErr) throw dueErr;

    const results: any[] = [];

    for (const d of due ?? []) {
      try {
        const { data: recipients, error: recErr } = await supabase
          .from("scheduled_file_recipients")
          .select("id, recipient_user_id")
          .eq("delivery_id", d.id)
          .eq("delivered", false);
        if (recErr) throw recErr;

        let okCount = 0;
        let failCount = 0;

        for (const r of recipients ?? []) {
          // Insert in-app notification per recipient
          const { error: nErr } = await supabase.from("notifications").insert({
            user_id: r.recipient_user_id,
            title: d.title,
            message: (d.message ?? "") + `\n\nAttachment: ${d.file_name}`,
            type: "scheduled_file",
            reference_id: d.id,
          });

          if (nErr) {
            failCount++;
            await supabase
              .from("scheduled_file_recipients")
              .update({ error: nErr.message })
              .eq("id", r.id);
          } else {
            okCount++;
            await supabase
              .from("scheduled_file_recipients")
              .update({ delivered: true, delivered_at: new Date().toISOString(), error: null })
              .eq("id", r.id);
          }
        }

        const newStatus = failCount === 0 ? "sent" : okCount === 0 ? "failed" : "sent";
        await supabase
          .from("scheduled_file_deliveries")
          .update({
            status: newStatus,
            attempts: 1,
            dispatched_at: new Date().toISOString(),
            last_error: failCount > 0 ? `${failCount} recipient(s) failed` : null,
          })
          .eq("id", d.id);

        results.push({ id: d.id, ok: okCount, failed: failCount, status: newStatus });
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        await supabase
          .from("scheduled_file_deliveries")
          .update({ status: "failed", attempts: 1, last_error: msg })
          .eq("id", d.id);
        results.push({ id: d.id, error: msg });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
