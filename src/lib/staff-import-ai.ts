import { supabase } from "@/integrations/supabase/client";
import type { ComparisonRow, ExistingStaff, Finding } from "../../supabase/functions/_shared/import-ai/comparison";
export type ImportAIFinding = Finding & { imported: ComparisonRow; existing: ExistingStaff | null; candidates_truncated: boolean };

export async function reviewStaffImport(rows: ComparisonRow[], signal: AbortSignal): Promise<ImportAIFinding[]> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("Sign in before reviewing staff imports.");
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-import-ai-review`, {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json", "x-cybernet-app": "cybernet-web" },
    body: JSON.stringify({ rows }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "AI review is unavailable. No staff records were changed.");
  }
  if (!response.body) throw new Error("AI review returned no response.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  let result: ImportAIFinding[] | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "result" && Array.isArray(event.findings)) result = event.findings;
      }
      if (done) break;
    }
    if (!result) throw new Error("AI review ended without a complete result. Try again only when the service is available.");
    return result;
  } finally { reader.releaseLock(); }
}