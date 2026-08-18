/**
 * Build/version identity — ITI - DD/MM/YYYY - Version
 *
 * The build date is injected at build time by vite.config.ts
 * (`__APP_BUILD_TIME__`), so it always reflects the real build/deploy moment.
 */

const PREFIX = "ITI";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** Raw ISO build timestamp injected at build time. */
export const BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : new Date().toISOString();

/** Semantic app version injected from package.json at build time. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "1.0.0";

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

/** Compact identifier, e.g. ITI18082026v1.0.0 */
export function buildId(): string {
  return `${PREFIX}${buildDateCompact()}v${APP_VERSION}`;
}

/** Readable identifier, e.g. "ITI - 18/08/2026 - v1.0.0" */
export function buildLabel(): string {
  return `${PREFIX} - ${buildDateDisplay()} - v${APP_VERSION}`;
}

/** Full tooltip line with the exact build timestamp. */
export function buildTooltip(): string {
  return `${buildLabel()} • built ${BUILD_TIME}`;
}
