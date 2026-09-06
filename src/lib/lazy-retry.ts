import { lazy, type ComponentType } from "react";

/**
 * Chunk-load-failure–resilient React.lazy.
 *
 * After a redeploy the hashed chunk filenames change. A browser tab that is
 * still running the previous build asks for a file that no longer exists and
 * React throws "Failed to fetch dynamically imported module", which renders a
 * blank screen. We retry once (transient network/CDN hiccup) and, if that also
 * fails, force a one-time hard reload so the tab picks up the new manifest.
 * The reload flag lives in sessionStorage so we can never loop.
 */
const RELOAD_KEY = "cybernet:chunk-reloaded";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
      return mod;
    } catch (err) {
      // One quick retry — covers transient network/CDN failures.
      try {
        await sleep(400);
        return await factory();
      } catch (err2) {
        let alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";
          sessionStorage.setItem(RELOAD_KEY, "1");
        } catch { /* storage blocked — skip reload guard */ }

        if (!alreadyReloaded && typeof window !== "undefined") {
          window.location.reload();
          // Never resolves: the page is going away.
          return await new Promise<{ default: T }>(() => {});
        }
        throw err2 ?? err;
      }
    }
  });
}
