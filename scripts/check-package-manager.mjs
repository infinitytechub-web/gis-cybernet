// Fails when a non-pnpm lockfile or a non-pnpm install command appears.
import { existsSync, readdirSync, readFileSync } from "node:fs";
const errors = [];
for (const f of ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", ".yarnrc.yml", "bun.lock", "bun.lockb", "bunfig.toml"])
  if (existsSync(f)) errors.push(`Forbidden file: ${f} (use pnpm-lock.yaml only)`);
if (!existsSync("pnpm-lock.yaml")) errors.push("Missing pnpm-lock.yaml");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (!/^pnpm@\d+\.\d+\.\d+$/.test(pkg.packageManager ?? "")) errors.push("package.json packageManager must pin pnpm@x.y.z");
if (pkg.workspaces) errors.push("Use pnpm-workspace.yaml, not package.json workspaces");
const bad = /\b(npm (ci|install|i)\b|yarn( install)?\b|bun (install|add)\b|setup-bun)/;
const dir = ".github/workflows";
if (existsSync(dir)) for (const f of readdirSync(dir))
  readFileSync(`${dir}/${f}`, "utf8").split("\n").forEach((l, i) => {
    if (bad.test(l)) errors.push(`${dir}/${f}:${i + 1} uses a non-pnpm installer: ${l.trim()}`);
  });
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Package manager check passed (pnpm only).");
