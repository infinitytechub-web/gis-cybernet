/**
 * Build/version identity — ITIDDMMYYYY-NN
 *
 * The build date and a unique per-build fingerprint are injected at build time
 * by vite.config.ts (`__APP_BUILD_TIME__`, `__APP_BUILD_FINGERPRINT__`).
 *
 * The sequence suffix (-NN) is assigned automatically by the backend the first
 * time a freshly deployed build is loaded (see `register_app_build` and
 * `useBuildRelease`), so the identifier never has to be edited by hand and each
 * deployment is recorded in the deployment history.
 *
 * `buildId()` returns the locally derived fallback (date + provisional sequence
 * 01) until the registered release resolves — the UI never renders blank.
 */

const PREFIX = "ITI";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** Raw ISO build timestamp injected at build time. */
export const BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : new Date().toISOString();

declare const __APP_VERSION__: string | undefined;

/** Semantic app version injected from package.json at build time. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "1.0.0";

/** Unique fingerprint for this build — the key used to register the release. */
export const BUILD_FINGERPRINT: string =
  typeof __APP_BUILD_FINGERPRINT__ === "string" && __APP_BUILD_FINGERPRINT__
    ? __APP_BUILD_FINGERPRINT__
    : `dev-${APP_VERSION}`;

function buildDate(): Date {
  const d = new Date(BUILD_TIME);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** DD/MM/YYYY of the build date. */
export function buildDateDisplay(): string {
  const d = buildDate();
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** DDMMYYYY of the build date (compact form). */
export function buildDateCompact(): string {
  const d = buildDate();
  return `${two(d.getDate())}${two(d.getMonth() + 1)}${d.getFullYear()}`;
}

export interface BuildRelease {
  version_id: string;
  build_date: string;
  seq: number;
  app_version: string | null;
  build_time: string;
  first_seen_at: string;
  fingerprint: string;
}

/**
 * Release resolved from the backend for this build. Cached at module level so
 * non-React consumers (e.g. RUM reporting, exports) share the same identifier.
 */
let resolved: BuildRelease | null = null;

export function setResolvedBuildRelease(release: BuildRelease | null): void {
  resolved = release ?? null;
}

export function getResolvedBuildRelease(): BuildRelease | null {
  return resolved;
}

/** Locally derived fallback identifier, e.g. ITI25082026-01 */
export function fallbackBuildId(): string {
  return `${PREFIX}${buildDateCompact()}-01`;
}

/** Compact identifier, e.g. ITI25082026-02 (registered) or the local fallback. */
export function buildId(): string {
  return resolved?.version_id ?? fallbackBuildId();
}

/** Readable identifier, e.g. "ITI - 25/08/2026 - 02" */
export function buildLabel(): string {
  const id = buildId();
  const body = id.slice(PREFIX.length);
  const [datePart, seqPart] = body.split("-");
  const dd = datePart.slice(0, 2);
  const mm = datePart.slice(2, 4);
  const yyyy = datePart.slice(4, 8);
  return `${PREFIX} - ${dd}/${mm}/${yyyy} - ${seqPart ?? "01"}`;
}

/** Full tooltip line with the exact build timestamp and app version. */
export function buildTooltip(): string {
  const suffix = resolved ? "" : " (pending registration)";
  return `${buildLabel()} • v${APP_VERSION} • built ${BUILD_TIME}${suffix}`;
}
