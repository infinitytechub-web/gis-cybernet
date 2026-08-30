import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MailCheck, MailX, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePageMeta } from "@/hooks/usePageMeta";

type State = "validating" | "valid" | "already" | "invalid" | "submitting" | "done" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("validating");
  const [message, setMessage] = useState<string>("");

  usePageMeta({
    title: "Email Unsubscribe — Cybernet HRM System",
    description:
      "Unsubscribe from Cybernet HRM System notification emails. Confirm your request to stop receiving system notifications from the Ghana Immigration Service HRM platform.",
    path: "/unsubscribe",
  });


  useEffect(() => {
    if (!token) { setState("invalid"); setMessage("Missing token."); return; }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) { setState("invalid"); setMessage(data.error || "Invalid or expired link."); return; }
        if (data.valid === false && data.reason === "already_unsubscribed") { setState("already"); return; }
        if (data.valid) { setState("valid"); return; }
        setState("invalid");
      })
      .catch(() => { setState("error"); setMessage("Could not reach server."); });
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    if (error) { setState("error"); setMessage(error.message); return; }
    if ((data as any)?.success) { setState("done"); return; }
    if ((data as any)?.reason === "already_unsubscribed") { setState("already"); return; }
    setState("error"); setMessage("Unexpected response.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Email Unsubscribe</h1>
          <CardDescription>Manage your GIS Cybernet notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "validating" && (<div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Validating link…</div>)}
          {state === "valid" && (
            <>
              <p className="text-sm">Click below to unsubscribe from GIS Cybernet emails.</p>
              <Button onClick={confirm} className="w-full">Confirm Unsubscribe</Button>
            </>
          )}
          {state === "submitting" && (<div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Processing…</div>)}
          {state === "done" && (<div className="flex items-center gap-2 text-emerald-600"><MailCheck className="h-5 w-5" /> You have been unsubscribed.</div>)}
          {state === "already" && (<div className="flex items-center gap-2 text-muted-foreground"><MailX className="h-5 w-5" /> This address is already unsubscribed.</div>)}
          {state === "invalid" && (<div className="flex items-center gap-2 text-destructive"><ShieldX className="h-5 w-5" /> {message || "Invalid link."}</div>)}
          {state === "error" && (<div className="flex items-center gap-2 text-destructive"><ShieldX className="h-5 w-5" /> {message || "Something went wrong."}</div>)}
        </CardContent>
      </Card>
    </div>
  );
}
