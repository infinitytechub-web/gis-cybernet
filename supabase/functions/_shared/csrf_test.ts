// supabase/functions/_shared/csrf_test.ts
//
// Comprehensive CSRF protection tests:
//
// 1. Unit tests for `assertCsrfSafe()` covering all branches.
// 2. Static-source contract tests: every function on PROTECTED_FUNCTIONS must
//    import + call the helper (regression guard against accidental removal).
// 3. Live integration tests against the deployed edge functions. They run
//    only when VITE_SUPABASE_URL is set in the environment (loaded from .env)
//    and verify a POST without the CSRF header gets a 403. Otherwise skipped
//    so local runs without network still pass.
//
// Run with:
//   supabase functions serve  # not required — tests hit the cloud URL
//   deno test --allow-net --allow-read --allow-env supabase/functions/_shared/csrf_test.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertCsrfSafe,
  csrfDeniedResponse,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
} from "./csrf.ts";

// Functions that MUST enforce CSRF (browser-invokable, state-changing).
// Keep in sync with SECURITY.md → CSRF section.
const PROTECTED_FUNCTIONS = [
  "admin-delete-staff-account",
  "admin-reset-password",
  "bulk-create-accounts",
  "bulk-upload-staff",
  "interlink-resend-notification",
  "reset-and-create-accounts",
  "send-record-email",
  "send-transactional-email",
  "sign-export",
  "system-backup",
  "system-backup-restore",
  "verify-shift-auth",
  "gps-cloud-export",
  "preview-transactional-email",
] as const;

const APP_ORIGIN = "https://gis-cybernet.lovable.app";

// ─────────────────────────────────────────────────────────────────
// 1. Unit tests for assertCsrfSafe
// ─────────────────────────────────────────────────────────────────

Deno.test("assertCsrfSafe: GET requests are always allowed", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", { method: "GET" }));
  assert(r.ok);
});

Deno.test("assertCsrfSafe: OPTIONS preflight is always allowed", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", { method: "OPTIONS" }));
  assert(r.ok);
});

Deno.test("assertCsrfSafe: POST with no Origin is rejected", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", { method: "POST" }));
  assert(!r.ok);
  assertStringIncludes(r.reason, "not allowed");
});

Deno.test("assertCsrfSafe: POST with attacker Origin is rejected", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", {
    method: "POST",
    headers: { origin: "https://evil.example.com", [CSRF_HEADER]: CSRF_HEADER_VALUE },
  }));
  assert(!r.ok);
  assertStringIncludes(r.reason, "not allowed");
});

Deno.test("assertCsrfSafe: POST from app origin without CSRF header is rejected", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", {
    method: "POST",
    headers: { origin: APP_ORIGIN },
  }));
  assert(!r.ok);
  assertStringIncludes(r.reason.toLowerCase(), "csrf");
});

Deno.test("assertCsrfSafe: POST from app origin with wrong CSRF value is rejected", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", {
    method: "POST",
    headers: { origin: APP_ORIGIN, [CSRF_HEADER]: "wrong" },
  }));
  assert(!r.ok);
});

Deno.test("assertCsrfSafe: POST from app origin with correct CSRF header is accepted", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", {
    method: "POST",
    headers: { origin: APP_ORIGIN, [CSRF_HEADER]: CSRF_HEADER_VALUE },
  }));
  assert(r.ok);
  assertEquals(r.origin, APP_ORIGIN);
});

Deno.test("assertCsrfSafe: any *.lovable.app origin is accepted with header", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", {
    method: "POST",
    headers: {
      origin: "https://id-preview--abc.lovable.app",
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
    },
  }));
  assert(r.ok);
});

Deno.test("assertCsrfSafe: Referer is honoured when Origin is missing", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", {
    method: "POST",
    headers: {
      referer: `${APP_ORIGIN}/some/path?q=1`,
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
    },
  }));
  assert(r.ok);
});

Deno.test("assertCsrfSafe: x-internal-caller bypass works", () => {
  const r = assertCsrfSafe(new Request("https://x.test/", {
    method: "POST",
    headers: { "x-internal-caller": "1" },
  }));
  assert(r.ok);
  assertEquals(r.origin, "internal");
});

Deno.test("csrfDeniedResponse: returns 403 with reason in JSON body", async () => {
  const res = csrfDeniedResponse({ "Access-Control-Allow-Origin": "*" }, "test reason");
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "CSRF check failed");
  assertEquals(body.reason, "test reason");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

// ─────────────────────────────────────────────────────────────────
// 2. Static contract tests — each protected function MUST wire the helper.
// ─────────────────────────────────────────────────────────────────

for (const fn of PROTECTED_FUNCTIONS) {
  Deno.test(`contract: ${fn} imports and calls assertCsrfSafe`, async () => {
    const url = new URL(`../${fn}/index.ts`, import.meta.url);
    const src = await Deno.readTextFile(url);
    assertStringIncludes(
      src,
      'from "../_shared/csrf.ts"',
      `${fn}/index.ts must import from _shared/csrf.ts`,
    );
    assertStringIncludes(
      src,
      "assertCsrfSafe(req)",
      `${fn}/index.ts must call assertCsrfSafe(req)`,
    );
    assertStringIncludes(
      src,
      "csrfDeniedResponse",
      `${fn}/index.ts must short-circuit with csrfDeniedResponse`,
    );
    assertStringIncludes(
      src,
      "x-cybernet-app",
      `${fn}/index.ts must allow the x-cybernet-app header in CORS`,
    );
  });
}

// ─────────────────────────────────────────────────────────────────
// 3. Live integration tests — POST without CSRF must return 403.
//     Skipped automatically when VITE_SUPABASE_URL is not set.
// ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";
const LIVE = SUPABASE_URL.length > 0 && ANON_KEY.length > 0;

for (const fn of PROTECTED_FUNCTIONS) {
  Deno.test({
    name: `integration: ${fn} rejects POST without CSRF header (403)`,
    ignore: !LIVE,
    async fn() {
      const url = `${SUPABASE_URL}/functions/v1/${fn}`;
      // Simulate a cross-origin browser POST: app origin spoofed off-list,
      // no CSRF header, no service-role auth.
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Anon JWT keeps the function from rejecting on missing auth before
          // it reaches the CSRF check; CSRF must still fire.
          authorization: `Bearer ${ANON_KEY}`,
          apikey: ANON_KEY,
          origin: "https://attacker.example.com",
        },
        body: "{}",
      });
      const text = await res.text(); // consume body to avoid leak
      assertEquals(
        res.status,
        403,
        `${fn} must respond 403 for cross-origin POST without CSRF header. ` +
        `Got ${res.status}: ${text.slice(0, 200)}`,
      );
      assertStringIncludes(text.toLowerCase(), "csrf");
    },
  });

  Deno.test({
    name: `integration: ${fn} rejects POST with wrong CSRF header value (403)`,
    ignore: !LIVE,
    async fn() {
      const url = `${SUPABASE_URL}/functions/v1/${fn}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ANON_KEY}`,
          apikey: ANON_KEY,
          origin: APP_ORIGIN,
          [CSRF_HEADER]: "definitely-not-the-right-value",
        },
        body: "{}",
      });
      const text = await res.text();
      assertEquals(
        res.status,
        403,
        `${fn} must respond 403 when CSRF header value is wrong. ` +
        `Got ${res.status}: ${text.slice(0, 200)}`,
      );
    },
  });
}
