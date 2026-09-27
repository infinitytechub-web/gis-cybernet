import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";

export function DeletionInsightsPanel() {
  const [staff, setStaff] = useState("");
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setResult(null);
    const { data, error } = await supabase.functions.invoke("deletion-insights", {
      body: { staff, notes, days: Number(days) },
    });
    setBusy(false);
    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { msg = (await error.context.json()).error ?? msg; } catch { /* keep */ }
      }
      setErr(msg);
      return;
    }
    setResult(`${data.summary}\n\n_Based on ${data.eventCount} recorded event(s)._`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" /> AI deletion review
        </CardTitle>
        <CardDescription>
          Enter a staff ID or surname (or leave blank for all), add any event details, and get a summary with unusual patterns flagged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
          <Input placeholder="Staff ID or surname (optional)" value={staff} onChange={(e) => setStaff(e.target.value)} maxLength={80} />
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea
          placeholder="Event details or context (optional) — e.g. who reported it, what was expected…"
          value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={3}
        />
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          {busy ? "Reviewing…" : "Summarise & flag"}
        </Button>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {result && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{result}</div>
        )}
      </CardContent>
    </Card>
  );
}
