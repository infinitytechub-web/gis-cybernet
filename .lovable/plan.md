## Goal

Bring every text/background combination on the Login page and the main authenticated screens up to WCAG 2.1 AA contrast (4.5:1 normal text, 3:1 large/UI). Most fixes are token-level, so a single pass through `src/index.css` clears the majority of the app.

## Audit results (computed ratios vs. white/foreground tokens)

Light theme:
- `--primary` (Sign In btn) 5.37 — PASS (already fixed last turn)
- `--secondary`, `--accent`, `--warning`, `--muted-foreground`, `--foreground`, sidebar — PASS
- `--destructive` on white  4.20 — FAIL (needs 4.5)
- `--success`   on white  2.89 — FAIL
- `--info`      on white  3.32 — FAIL

Dark theme:
- `--primary` (now dark text on cyan) 13.2 — PASS
- `--success`  on white 2.63 — FAIL
- `--info`     on white 2.95 — FAIL
- All other tokens PASS

Per-page spot checks (Login, Dashboard, Staff Directory, Pending Staff Approvals, Announcements, Reports, Settings) show no hard-coded grey/white-on-white classes — every weak combination traces back to the three failing tokens above and to a couple of `text-muted-foreground/60` opacity uses.

## Fixes

### 1. Token adjustments in `src/index.css`

Light (`:root`):
- `--destructive: 0 85% 55%`  -> `0 85% 45%`   (white text -> ~6.1:1)
- `--success:    152 70% 40%` -> `152 75% 28%` (white text -> ~5.5:1)
- `--info:       205 85% 50%` -> `205 90% 38%` (white text -> ~5.0:1)

Dark (`.dark`):
- `--success: 152 70% 42%` -> `152 70% 38%` + change `--success-foreground` use sites already use white; keep white but darken to ~4.6:1
- `--info:    205 85% 55%` -> `205 90% 40%` (white text -> ~4.7:1)
- `--destructive` already 5.14 — leave.

Re-run the ratio script after edits to confirm every pair clears 4.5:1.

### 2. Opacity / low-contrast utility sweep

Grep for and replace fragile patterns in `src/`:
- `text-muted-foreground/60`, `/50`, `/70` -> drop the opacity (token is already AA on its own).
- `text-white/70`, `text-white/60` on coloured banners -> `text-white` or `text-primary-foreground`.
- Any `text-gray-300|400` / `placeholder:text-gray-*` -> `text-muted-foreground` / `placeholder:text-muted-foreground`.

### 3. Login page specifics (`src/pages/Login.tsx`)

- "Powered by..." footer line: currently `text-xs text-muted-foreground` on white card -> already 5.9:1 PASS, no change.
- MFA helper text and "Lost your authenticator?" link: verify after token changes; no edits expected.
- Confirm focus ring uses updated `--ring` token (already aligned with primary).

### 4. Verification

- Re-run the HSL contrast script for the full token matrix; assert every pair >= 4.5:1 (or >= 3:1 for large headings / icon-only UI).
- Visually re-screenshot Login, Dashboard, Pending Staff Approvals, Announcements in both light and dark themes.
- Re-run `tests/a11y/login.spec.ts` (and `authenticated.spec.ts`) locally via Playwright + axe; expect zero color-contrast violations.

## Out of scope

- Restructuring components, copy changes, or layout work.
- Sidebar/Night-Guard brand colours (already passing).
- Non-text decorative elements (borders, dividers) where 3:1 UI threshold already met.

## Files touched

- `src/index.css` (token values only)
- Targeted edits in any component flagged by the opacity sweep (expected: small handful, e.g. `AnnouncementsBanner.tsx`, `OnlineNowPanel.tsx`).
