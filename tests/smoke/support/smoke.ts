import { test, type Page } from "@playwright/test";

/**
 * Shared helpers for the post-deployment smoke suite.
 *
 * Environment contract (same `E2E_*` vars the existing e2e/a11y suites use):
 *   E2E_BASE_URL            — deployed origin under test (optional; local preview otherwise)
 *   E2E_SUPABASE_URL        — backend URL
 *   E2E_SUPABASE_ANON_KEY   — publishable key
 *   E2E_TEST_EMAIL/PASSWORD — non-privileged staff account
 *   E2E_ADMIN_EMAIL/PASSWORD— administrator account (optional)
 *
 * Everything here is read-only: no inserts, updates, or deletes.
 */

export const env = {
  get supabaseUrl() { return process.env.E2E_SUPABASE_URL; },
  get anonKey() { return process.env.E2E_SUPABASE_ANON_KEY; },
  get staffEmail() { return process.env.E2E_TEST_EMAIL; },
  get staffPassword() { return process.env.E2E_TEST_PASSWORD; },
  get adminEmail() { return process.env.E2E_ADMIN_EMAIL; },
  get adminPassword() { return process.env.E2E_ADMIN_PASSWORD; },
};

/** True when we can talk to the backend at all. */
export function hasBackend() {
  return !!(env.supabaseUrl && env.anonKey);
}

export function hasStaffCreds() {
  return hasBackend() && !!(env.staffEmail && env.staffPassword);
}

export function hasAdminCreds() {
  return hasBackend() && !!(env.adminEmail && env.adminPassword);
}

/** Skip guard with an explicit, readable reason in the report. */
export function requireStaffCreds() {
  test.skip(!hasStaffCreds(), "Set E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY / E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run this check.");
}

export function requireAdminCreds() {
  test.skip(!hasAdminCreds(), "Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to run this administrator check.");
}

/** localStorage key the Supabase JS client persists its session under. */
export function storageKey(): string {
  const ref = new URL(env.supabaseUrl!).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

export type Session = { access_token: string; refresh_token: string; user: { id: string } };

/** Password grant against the public auth endpoint. Returns null on failure. */
export async function signInWithPassword(email: string, password: string): Promise<Session | null> {
  const res = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey!, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) { await res.text(); return null; }
  return (await res.json()) as Session;
}

/** Seed a session into the page so the SPA boots authenticated. */
export async function seedSession(page: Page, session: Session) {
  await page.addInitScript(
    ([key, value]: [string, string]) => {
      try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
    },
    [storageKey(), JSON.stringify(session)],
  );
}

/** Sign in as a role and seed the browser session. Throws if creds are wrong. */
export async function bootAs(page: Page, role: "staff" | "admin") {
  const email = role === "admin" ? env.adminEmail! : env.staffEmail!;
  const password = role === "admin" ? env.adminPassword! : env.staffPassword!;
  const session = await signInWithPassword(email, password);
  if (!session) throw new Error(`Smoke sign-in failed for the ${role} account — check the credentials secret.`);
  await seedSession(page, session);
  return session;
}

/** Collect console errors so a smoke run surfaces runtime breakage. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err?.message ?? err)));
  return errors;
}

/** Noise we never want to fail a smoke run on (network flake, tile 4xx, extensions). */
const IGNORED_CONSOLE = [
  /favicon/i, /tile/i, /maps-tile-proxy/i, /net::ERR_/i,
  /ResizeObserver loop/i, /Download the React DevTools/i,
  /Failed to load resource/i, /the server responded with a status of 4\d\d/i,
];

export function significantErrors(errors: string[]): string[] {
  return errors.filter((e) => !IGNORED_CONSOLE.some((rx) => rx.test(e)));
}

/** Read a table through the Data API with a specific user token (read-only). */
export async function restSelect(table: string, token: string, query = "select=*&limit=1") {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: env.anonKey!, authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  return { status: res.status, body };
}

/**
 * Invoke an edge function with a given token. Includes the CSRF header the SPA
 * sends so we are testing authorization, not the CSRF wall.
 */
export async function callFunction(name: string, token: string, payload: unknown, origin: string) {
  const res = await fetch(`${env.supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: env.anonKey!,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-cybernet-app": "cybernet-web",
      origin,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { status: res.status, body };
}

/** Wait until the authenticated app shell is on screen. */
export async function expectAppShell(page: Page) {
  await page.waitForSelector("#main-content, main", { timeout: 20_000 });
}
