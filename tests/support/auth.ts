import type { Page } from "@playwright/test";

/**
 * Programmatic sign-in. Seeds the Supabase JS storage key directly in
 * localStorage so the SPA boots already authenticated — far faster and
 * less flaky than driving the login form for every test.
 *
 * Test credentials must be supplied via env vars to avoid checking in
 * passwords. CI sets:
 *   E2E_BASE_URL              — preview origin (default: http://localhost:4173)
 *   E2E_SUPABASE_URL          — Supabase project URL
 *   E2E_SUPABASE_ANON_KEY     — anon key
 *   E2E_TEST_EMAIL            — staff test account (e.g. test.user@gis.local)
 *   E2E_TEST_PASSWORD         — that account's password
 */
export async function signInAs(page: Page, role: "staff" | "admin" = "staff") {
  const url = process.env.E2E_SUPABASE_URL;
  const anon = process.env.E2E_SUPABASE_ANON_KEY;
  const email = role === "admin" ? process.env.E2E_ADMIN_EMAIL : process.env.E2E_TEST_EMAIL;
  const password = role === "admin" ? process.env.E2E_ADMIN_PASSWORD : process.env.E2E_TEST_PASSWORD;
  if (!url || !anon || !email || !password) {
    throw new Error(
      "Missing E2E auth env vars (E2E_SUPABASE_URL / ANON_KEY / TEST_EMAIL / TEST_PASSWORD).",
    );
  }

  // Exchange credentials for a session via the public auth endpoint.
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anon,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Auth sign-in failed: ${res.status} ${await res.text()}`);
  const session = await res.json();

  // The Supabase client persists under a deterministic key derived from the
  // project ref. Mirror its shape so the SPA picks it up on first paint.
  const ref = new URL(url).hostname.split(".")[0];
  const storageKey = `sb-${ref}-auth-token`;
  await page.addInitScript(
    ([key, value]: [string, string]) => {
      try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
    },
    [storageKey, JSON.stringify(session)],
  );
}

/**
 * Returns just the access token for a given user. Used by edge-function /
 * REST regression specs that need to hand-craft `Authorization: Bearer …`
 * headers instead of driving the SPA.
 */
export async function signInToken(email: string, password: string): Promise<string> {
  const url = process.env.E2E_SUPABASE_URL;
  const anon = process.env.E2E_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY");
  }
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}
