/**
 * Extract the human-readable error message from a supabase.functions.invoke
 * error. FunctionsHttpError hides the real server payload inside `context`
 * (a Response). Without unwrapping it, admins only see the generic
 * "Edge Function returned a non-2xx status code" message.
 *
 * Safe to call with any thrown value — falls back to the raw `.message`
 * or a generic default.
 */
export async function extractEdgeFunctionError(
  err: unknown,
  fallback = "Request failed"
): Promise<string> {
  if (!err) return fallback;
  const anyErr = err as any;

  // Try to read the embedded Response body (FunctionsHttpError)
  try {
    const ctx = anyErr?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.clone().json().catch(() => null);
      const msg = body?.error || body?.reason || body?.message;
      if (msg && typeof msg === "string") return msg;
    } else if (ctx && typeof ctx.text === "function") {
      const text = await ctx.clone().text().catch(() => "");
      if (text) {
        try {
          const parsed = JSON.parse(text);
          const msg = parsed?.error || parsed?.reason || parsed?.message;
          if (msg && typeof msg === "string") return msg;
        } catch {
          if (text.length < 500) return text;
        }
      }
    }
  } catch {
    /* ignore parse errors and fall through */
  }

  if (typeof anyErr?.message === "string" && anyErr.message) return anyErr.message;
  if (typeof err === "string") return err;
  return fallback;
}
