# Welcome to your Lovable project

TODO: Document your project here

## Development prerequisites

This project uses **pnpm only**. `pnpm-lock.yaml` is the single lockfile; do not add `package-lock.json`, `yarn.lock` or `bun.lock(b)`, and do not run `npm install`, `yarn install` or `bun install`.

- Node.js 20 or newer
- pnpm at the version pinned in `package.json` → `packageManager` (enable with `corepack enable`)

```sh
pnpm install                    # local install
pnpm install --frozen-lockfile  # CI / production (reproducible)
pnpm run dev | build | test | lint | typecheck
pnpm run check:pm               # fails if another package manager's files appear
```

Translate third-party instructions: `npm install x` → `pnpm add x`, `npm i -D x` → `pnpm add -D x`, `npx x` → `pnpm dlx x` (or `pnpm exec x` for local tools). Workspaces are declared in `pnpm-workspace.yaml` (future shared, mobile, API and worker packages go in `packages/*` or `apps/*`).
