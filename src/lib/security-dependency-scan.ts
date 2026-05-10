// Client-side dependency / repo hygiene checks.
//
// We can't run `npm audit` from the browser, so we ship a curated advisory
// table covering the most common high-impact issues for this stack. Every
// finding is conservative — we only flag a dep when its declared semver range
// allows a known-vulnerable or known-deprecated version.
//
// To extend: add an entry to ADVISORIES with the package name, an optional
// `vulnerableBelow` (semver-style "x.y.z") plus a severity/title/detail.
import pkgRaw from "../../package.json?raw";

export type ScanSeverity = "info" | "warn" | "error";
export interface ScanFinding {
  check: string;
  severity: ScanSeverity;
  title: string;
  detail?: string;
}

interface Advisory {
  /** package name */
  name: string;
  /** versions strictly less than this are flagged */
  vulnerableBelow?: string;
  severity: ScanSeverity;
  title: (declared: string) => string;
  detail: string;
}

const ADVISORIES: Advisory[] = [
  // Vite < 5.4.20 has a couple of public CVEs (path traversal, dev-server XSS).
  {
    name: "vite",
    vulnerableBelow: "5.4.20",
    severity: "warn",
    title: (v) => `vite ${v} is below the recommended patched 5.4.20`,
    detail:
      "Older Vite 5 versions have known dev-server path traversal advisories. Upgrade to ^5.4.20 or later.",
  },
  // axios < 1.8.0 — SSRF / credential leak class CVEs.
  {
    name: "axios",
    vulnerableBelow: "1.8.0",
    severity: "error",
    title: (v) => `axios ${v} is affected by published CVEs`,
    detail: "Upgrade axios to >= 1.8.0 to pick up SSRF + credential-leak fixes.",
  },
  // Cross-spawn DoS prototype regression
  {
    name: "cross-spawn",
    vulnerableBelow: "7.0.5",
    severity: "warn",
    title: (v) => `cross-spawn ${v} has a published ReDoS advisory`,
    detail: "Upgrade cross-spawn to >= 7.0.5.",
  },
  // node-fetch < 2.6.7 has SSRF
  {
    name: "node-fetch",
    vulnerableBelow: "2.6.7",
    severity: "warn",
    title: (v) => `node-fetch ${v} predates the SSRF patch`,
    detail: "Upgrade to >= 2.6.7 (or migrate to native fetch).",
  },
  // semver < 7.5.2 has a ReDoS
  {
    name: "semver",
    vulnerableBelow: "7.5.2",
    severity: "warn",
    title: (v) => `semver ${v} has a published ReDoS advisory`,
    detail: "Upgrade semver to >= 7.5.2.",
  },
  // jspdf < 3.0.0 had multiple prototype-pollution / XSS issues
  {
    name: "jspdf",
    vulnerableBelow: "3.0.0",
    severity: "warn",
    title: (v) => `jspdf ${v} predates the 3.x security rewrite`,
    detail: "Upgrade jspdf to ^3.0.0 (or 4.x) for the modernised renderer.",
  },
];

function parseSemver(v: string): [number, number, number] | null {
  // Strip leading ^, ~, >=, etc.
  const m = v.replace(/^[^\d]*/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function lt(a: [number, number, number], b: [number, number, number]) {
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}

export function runRepoHygieneScan(): ScanFinding[] {
  const findings: ScanFinding[] = [];

  let pkg: any = {};
  try {
    pkg = JSON.parse(pkgRaw);
  } catch {
    findings.push({
      check: "package_json_parse",
      severity: "error",
      title: "Could not parse package.json",
      detail: "Repository hygiene scan was unable to read the project manifest.",
    });
    return findings;
  }

  const allDeps: Record<string, string> = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  const totalDeps = Object.keys(allDeps).length;

  // 1. Curated CVE / advisory checks
  let vulnerableHits = 0;
  for (const adv of ADVISORIES) {
    const declared = allDeps[adv.name];
    if (!declared) continue;
    const parsed = parseSemver(declared);
    if (!parsed || !adv.vulnerableBelow) continue;
    const cutoff = parseSemver(adv.vulnerableBelow);
    if (!cutoff) continue;
    if (lt(parsed, cutoff)) {
      vulnerableHits++;
      findings.push({
        check: `outdated_dependency:${adv.name}`,
        severity: adv.severity,
        title: adv.title(declared),
        detail: adv.detail,
      });
    }
  }

  // 2. Risky version specifiers
  const risky = Object.entries(allDeps).filter(([, v]) =>
    /^(\*|latest|next|x)$/.test(v) ||
    /^git[+:]/.test(v) ||
    /^https?:/.test(v),
  );
  for (const [name, v] of risky) {
    findings.push({
      check: `unpinned_dependency:${name}`,
      severity: "warn",
      title: `Dependency "${name}" uses a non-pinned spec (${v})`,
      detail:
        "Floating ranges like *, latest, git URLs or http URLs make builds non-reproducible and bypass advisory checks. Pin to a fixed semver.",
    });
  }

  // 3. Missing engines field
  if (!pkg.engines || !pkg.engines.node) {
    findings.push({
      check: "missing_engines_node",
      severity: "info",
      title: "package.json has no engines.node constraint",
      detail:
        "Pin a Node.js major version (e.g. \"node\": \">=20\") so production runtimes don't drift from local development.",
    });
  }

  // 4. Informational summary so the report always carries a baseline number.
  findings.push({
    check: "dependency_summary",
    severity: "info",
    title: `${totalDeps} npm dependencies declared`,
    detail:
      vulnerableHits > 0
        ? `${vulnerableHits} dependency advisory hit${vulnerableHits === 1 ? "" : "s"} flagged above.`
        : "No advisories matched the curated CVE table.",
  });

  return findings;
}
