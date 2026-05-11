#!/usr/bin/env node
/**
 * SRI/crossorigin lint for external <script> and <link rel="stylesheet"> tags.
 *
 * Flags any tag whose `src`/`href` points at a remote origin (http://, https://,
 * or protocol-relative //) but is missing either:
 *   - `integrity="sha(256|384|512)-..."` (Subresource Integrity hash), OR
 *   - `crossorigin="anonymous"` / `crossorigin="use-credentials"`.
 *
 * Same-origin (relative) URLs and intentionally inline scripts/styles are skipped.
 *
 * Scans: *.html, *.tsx, *.jsx, *.ts, *.js (excluding node_modules, dist, build).
 *
 * Exit codes: 0 = clean, 1 = at least one violation, 2 = scanner error.
 *
 * Usage:
 *   node scripts/check-sri.mjs                     # scan whole repo
 *   node scripts/check-sri.mjs path/to/file.html   # scan specific files
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".turbo",
  "coverage", ".cache", "public/assets", ".vercel",
]);
const SKIP_FILES = new Set([
  // The scanner's own source contains documentation examples that look like
  // remote tags; excluding it prevents self-flagging.
  path.join("scripts", "check-sri.mjs"),
]);
const FILE_EXTS = new Set([".html", ".htm", ".tsx", ".jsx", ".ts", ".js", ".mjs"]);

/** Recursively gather candidate files. */
async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);
    if (SKIP_DIRS.has(rel)) continue;
    if (e.isDirectory()) {
      await walk(full, out);
    } else if (FILE_EXTS.has(path.extname(e.name)) && !SKIP_FILES.has(rel)) {
      out.push(full);
    }
  }
  return out;
}

const SCRIPT_TAG = /<script\b([^>]*)>/gi;
const LINK_TAG = /<link\b([^>]*)\/?>/gi;
const ATTR = (name) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");

function getAttr(tagAttrs, name) {
  const m = ATTR(name).exec(tagAttrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

function isRemoteUrl(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url) || /^\/\//.test(url);
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

const violations = [];

function check(file, source) {
  // <script src="https://…">
  for (const m of source.matchAll(SCRIPT_TAG)) {
    const attrs = m[1] ?? "";
    const src = getAttr(attrs, "src");
    if (!isRemoteUrl(src)) continue;
    const integrity = getAttr(attrs, "integrity");
    const crossorigin = getAttr(attrs, "crossorigin");
    const missing = [];
    if (!integrity || !/^sha(256|384|512)-/.test(integrity)) missing.push("integrity");
    if (!crossorigin) missing.push("crossorigin");
    if (missing.length) {
      violations.push({
        file: path.relative(ROOT, file),
        line: lineOf(source, m.index ?? 0),
        kind: "script",
        url: src,
        missing,
      });
    }
  }

  // <link rel="stylesheet" href="https://…"> (and rel=preload as=style|script)
  for (const m of source.matchAll(LINK_TAG)) {
    const attrs = m[1] ?? "";
    const rel = (getAttr(attrs, "rel") ?? "").toLowerCase();
    const asAttr = (getAttr(attrs, "as") ?? "").toLowerCase();
    const href = getAttr(attrs, "href");
    const sriApplies =
      rel === "stylesheet" ||
      rel === "modulepreload" ||
      (rel === "preload" && (asAttr === "style" || asAttr === "script"));
    if (!sriApplies) continue;
    if (!isRemoteUrl(href)) continue;
    const integrity = getAttr(attrs, "integrity");
    const crossorigin = getAttr(attrs, "crossorigin");
    const missing = [];
    if (!integrity || !/^sha(256|384|512)-/.test(integrity)) missing.push("integrity");
    if (!crossorigin) missing.push("crossorigin");
    if (missing.length) {
      violations.push({
        file: path.relative(ROOT, file),
        line: lineOf(source, m.index ?? 0),
        kind: `link(${rel}${asAttr ? `,as=${asAttr}` : ""})`,
        url: href,
        missing,
      });
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const targets = argv.length
    ? argv.map((a) => path.resolve(ROOT, a))
    : await walk(ROOT);

  for (const file of targets) {
    let stat;
    try { stat = await fs.stat(file); } catch { continue; }
    if (!stat.isFile()) continue;
    const source = await fs.readFile(file, "utf8");
    check(file, source);
  }

  if (violations.length === 0) {
    console.log(`✓ SRI check passed (${targets.length} files scanned).`);
    process.exit(0);
  }

  console.error(`✗ SRI check failed: ${violations.length} violation(s).\n`);
  for (const v of violations) {
    console.error(
      `  ${v.file}:${v.line}  [${v.kind}]  ${v.url}\n` +
      `    missing: ${v.missing.join(", ")}\n`,
    );
    // GitHub Actions annotation (picked up automatically when run in CI).
    if (process.env.GITHUB_ACTIONS) {
      console.log(
        `::error file=${v.file},line=${v.line},title=Missing SRI/crossorigin::` +
        `External ${v.kind} ${v.url} is missing ${v.missing.join(" + ")}.`,
      );
    }
  }
  console.error(
    "Fix: self-host the asset (preferred) OR add both `integrity=\"sha384-…\"` " +
    "and `crossorigin=\"anonymous\"`. See SECURITY.md → Subresource Integrity.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("scanner error:", err);
  process.exit(2);
});
