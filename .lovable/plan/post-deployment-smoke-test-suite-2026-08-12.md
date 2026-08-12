# Post-Deployment Smoke Test Suite

A single command that runs a fast, read-only set of checks against any deployed environment (preview, production, or a local preview build) and reports pass/fail for the three areas that matter most after a release: authentication, map tile failover, and permission enforcement.

## What the suite covers

**1. Auth flows**
- Login page renders, brand text is present, and the staff-ID/email field plus submit button are reachable.
- Unauthenticated access to a protected route (e.g. `/dashboard`, `/admin`) redirects to login instead of rendering data.
- Password sign-in against the auth API succeeds for the staff test account and returns a usable session.
- A seeded session boots the SPA already authenticated and lands on the dashboard shell (sidebar + main content present).
- Invalid credentials are rejected with an error message and no session is stored.
- Sign-out clears the session and returns the user to the login screen.

**2. Map failover**
- On a map surface, requests to the tile proxy are blocked/aborted to force tile errors, then the suite asserts the app switches to the next provider in the chain (a `map-tiles-failover` signal is observed) and the map still renders markers.
- With every provider blocked, the suite asserts the exhausted state surfaces the "base map unavailable — markers still shown" messaging rather than a blank crash.
- The tile status banner appears and does not block interaction with the rest of the page.

**3. Permission checks**
- Staff account: command-only routes (Admin Console, command roles, sensitive audit views) are denied — no admin panel content, redirect or access-denied state instead.
- Staff account: admin-only navigation entries are absent from the sidebar.
- Admin account (when admin credentials are provided): the same routes load and expose their admin panels.
- Server-side enforcement: direct REST reads of a restricted table with the staff token return zero rows / a permission error, confirming RLS is not relying on the UI.
- Privileged edge function called with a staff token returns 403; the same call with an admin token is accepted.

Everything is read-only — no records are created, edited, or deleted, so the suite is safe to run against production.

## How you run it

- `npm run test:smoke` — runs against the URL in `E2E_BASE_URL` (falls back to building and serving a local preview).
- `npm run test:smoke:prod` — same suite pointed at the published URL.
- Any check whose credentials are missing skips with a clear reason instead of failing, so the suite still gives useful signal in environments without secrets.
- Output is the standard Playwright list report plus an HTML report artifact for failures (screenshots, traces).

## Technical notes

- New specs under `tests/smoke/`: `auth.smoke.spec.ts`, `map-failover.smoke.spec.ts`, `permissions.smoke.spec.ts`, plus a shared `tests/smoke/support/smoke.ts` helper for env resolution, skip guards, and console-error collection.
- Reuses the existing `tests/support/auth.ts` helpers (`signInAs`, `signInToken`) — no new auth plumbing, same `E2E_*` env var contract already used by CI.
- New `playwright.smoke.config.ts`: chromium-only, short timeouts, retries=1, `webServer` only when `E2E_BASE_URL` is unset, so it can point at a live deployment without a local build.
- Map failover assertions hook `window` events already emitted by `src/lib/leaflet-base-layers.ts` (`map-tiles-failover`, `map-tiles-exhausted`) via an init script that records them, combined with `page.route` aborts on the tile-proxy and provider URLs.
- Permission assertions combine UI checks with direct `fetch` calls to REST/edge endpoints using tokens from `signInToken`, so both client gating and server enforcement are verified.
- `package.json` gains `test:smoke` and `test:smoke:prod` scripts; the existing `test:e2e` / `test:a11y` scripts and configs stay untouched.
- Optional CI addition: a manually-triggerable `smoke.yml` workflow (`workflow_dispatch`) that runs the suite against a chosen URL after a deploy.

## Out of scope

- No mutation/regression coverage (bulk approvals, intake creation) — those stay in the existing `tests/e2e` specs.
- No accessibility scanning — that remains in `tests/a11y`.
