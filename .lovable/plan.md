# Standardize on pnpm

## Current state (checked)
- `package.json` already pins `"packageManager": "pnpm@9.15.0"`; `pnpm-lock.yaml` exists.
- Conflicting lockfiles also exist: `package-lock.json` and `bun.lock`.
- `.npmrc` comment says the build harness uses package-lock.json.
- CI workflows (typecheck, smoke, date-format, accessibility, security-scan) install with Bun (`oven-sh/setup-bun`, `bun install`, `bun add`, `bun run`) and run `npm audit`.
- Playwright configs, SECURITY.md and deploy/cloudflare README use `npm run` / `npm i -g`.
- This repo is a single app package (web + Supabase edge functions). There are no separate mobile, API or worker packages today.

## Changes
1. **Pin pnpm**: update `packageManager` to the latest stable pnpm 10.x (exact version with hash-free pin), and `engines.pnpm` to match the major.
2. **Single lockfile**: delete `package-lock.json` and `bun.lock`; regenerate `pnpm-lock.yaml` with pnpm; add both other lockfiles and `yarn.lock` to `.gitignore`.
3. **Workspace file**: add a minimal `pnpm-workspace.yaml` (root package only, with `packages/*` and `apps/*` globs ready for future shared/mobile/API/worker packages). No code is moved.
4. **CI**: in every workflow replace Bun setup with `pnpm/action-setup` + `actions/setup-node` (cache: pnpm), `pnpm install --frozen-lockfile`, `pnpm run ...`, `pnpm audit --prod --audit-level high`; replace `bun add -d` with `pnpm add -D`.
5. **Scripts/docs**: switch Playwright `webServer` commands to `pnpm run build && pnpm run preview ...`; update SECURITY.md, README and deploy docs (`pnpm add -g wrangler` / `pnpm dlx`), and fix the `.npmrc` comment.
6. **Prerequisites doc**: README section "Development prerequisites": Node 20+, Corepack (`corepack enable`), pnpm version from `packageManager`, common commands.
7. **Guard**: add a small CI check (script in `scripts/`) that fails if `package-lock.json`, `yarn.lock`, `bun.lock(b)` appear or a workflow uses npm/yarn/bun install.
8. **AGENTS.md rule**: record "pnpm only; pnpm-lock.yaml is the sole lockfile".

## Important limitation
The Lovable editor's own internal tooling installs dependencies itself and may recreate `package-lock.json` or `bun.lock` when packages are added. These would be removed again by the guard/cleanup, and CI and your own deployments will use pnpm only — but I cannot change how the Lovable preview installs packages.

## Technical notes
- Lockfile regeneration uses `pnpm install --lockfile-only` (no npm/yarn/bun install).
- Edge functions (Deno) import via URLs and are unaffected.
