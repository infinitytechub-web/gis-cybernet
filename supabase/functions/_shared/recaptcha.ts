// Shared reCAPTCHA v3 verification helper.
//
// Policy is stored in `app_settings` (recaptcha_enabled / recaptcha_min_score)
// and the secret in the RECAPTCHA_SECRET_KEY runtime secret. Verification is
// fail-CLOSED while enabled: a missing, replayed, low-score or unverifiable
// token is rejected. When the admin has not switched it on (or no secret is
// configured) the check is skipped so existing flows keep working.

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export interface RecaptchaOutcome {
  ok: boolean;
  /** Present when ok === false — safe, generic message for the client. */
  message?: string;
  score?: number | null;
  skipped?: boolean;
}

interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> } };
    };
  };
}

export async function verifyRecaptcha(
  supabase: SupabaseLike,
  token: unknown,
  expectedAction: string,
  ip?: string | null,
): Promise<RecaptchaOutcome> {
  const secret = Deno.env.get("RECAPTCHA_SECRET_KEY") ?? "";

  let enabled = false;
  let minScore = 0.5;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("recaptcha_enabled, recaptcha_min_score")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = (data ?? null) as
      | { recaptcha_enabled?: boolean; recaptcha_min_score?: number | string | null }
      | null;
    enabled = row?.recaptcha_enabled === true;
    const parsed = Number(row?.recaptcha_min_score ?? 0.5);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) minScore = parsed;
  } catch {
    // Settings unreadable — do not lock everybody out of the system.
    return { ok: true, skipped: true };
  }

  if (!enabled || !secret) return { ok: true, skipped: true };

  const value = typeof token === "string" ? token.trim() : "";
  if (!value || value.length > 4096) {
    return { ok: false, message: "Bot verification failed. Reload the page and try again." };
  }

  try {
    const body = new URLSearchParams({ secret, response: value });
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const result = (await res.json()) as {
      success?: boolean;
      score?: number;
      action?: string;
      "error-codes"?: string[];
    };

    if (result.success !== true) {
      // Diagnostics only — no token or secret material is logged.
      console.error("recaptcha_siteverify_failed", JSON.stringify({
        codes: result["error-codes"] ?? [],
        expectedAction,
      }));
      return { ok: false, message: "Bot verification failed. Reload the page and try again." };
    }
    if (expectedAction && result.action && result.action !== expectedAction) {
      console.error("recaptcha_action_mismatch", JSON.stringify({ got: result.action, expectedAction }));
      return { ok: false, message: "Bot verification failed. Reload the page and try again." };
    }

    const score = typeof result.score === "number" ? result.score : 0;
    if (score < minScore) {
      return {
        ok: false,
        score,
        message: "This request looks automated and was blocked. Try again or contact an administrator.",
      };
    }
    return { ok: true, score };
  } catch {
    // Google unreachable — fail closed while protection is switched on.
    return { ok: false, message: "Bot verification is unavailable right now. Please try again." };
  }
}
