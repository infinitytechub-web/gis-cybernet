// Lightweight Real User Monitoring (RUM) collector.
//
// Captures Core Web Vitals (LCP, FCP, CLS, INP, TTFB), SPA route changes,
// JS errors, and unhandled promise rejections — batches them, and ships
// them to the `rum-ingest` edge function via `navigator.sendBeacon` (with
// `fetch keepalive` fallback) so we don't block unload.
//
// Designed to be lazy: web-vitals is dynamically imported AFTER the page
// becomes interactive, so it never delays the LCP it's measuring.

import { supabase } from "@/integrations/supabase/client";

type Event =
  | { kind: "lcp" | "fcp" | "cls" | "inp" | "ttfb"; route: string; value: number; rating: string; meta?: Record<string, unknown> }
  | { kind: "route"; route: string; value: number; meta?: Record<string, unknown> } // navigation duration in ms
  | { kind: "error" | "rejection"; route: string; meta: { message: string; stack?: string; filename?: string } }
  | { kind: "nav"; route: string; value: number; meta?: Record<string, unknown> };

const BUILD_ID: string = (typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev") as string;

const SESSION_ID = (() => {
  try {
    const k = "__cybernet_rum_sid__";
    const existing = sessionStorage.getItem(k);
    if (existing) return existing;
    const sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(k, sid);
    return sid;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
})();

const queue: Event[] = [];
let userId: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_QUEUE = 50;
const FLUSH_INTERVAL_MS = 15_000;
let endpoint = "";

function currentRoute(): string {
  try { return window.location.pathname + window.location.search; } catch { return "/"; }
}

function viewportTag(): string {
  try { return `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio ?? 1}`; } catch { return ""; }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush(false);
  }, FLUSH_INTERVAL_MS);
}

function enqueue(ev: Event) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(ev);
  if (queue.length >= 10) flush(false);
  else scheduleFlush();
}

function flush(useBeacon: boolean) {
  if (!endpoint || queue.length === 0) return;
  const events = queue.splice(0, queue.length);
  const payload = JSON.stringify({
    events,
    session_id: SESSION_ID,
    build_id: BUILD_ID,
    viewport: viewportTag(),
    user_id: userId,
  });

  try {
    if (useBeacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon(endpoint, blob);
      if (ok) return;
    }
    // Fallback: keepalive fetch (works during pagehide).
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* swallow — RUM must never break the app */
    });
  } catch {
    /* swallow */
  }
}

function resolveEndpoint(): string {
  // SUPABASE_URL is exposed via the auto-generated client — read it from there.
  // Fall back to the env var if set.
  const fromEnv = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const base = fromEnv ?? "";
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/functions/v1/rum-ingest`;
}

export function initRum() {
  if (typeof window === "undefined") return;
  if ((window as any).__cybernet_rum_init__) return;
  (window as any).__cybernet_rum_init__ = true;

  endpoint = resolveEndpoint();
  if (!endpoint) return;

  // Capture user id when available (best-effort).
  supabase.auth.getUser().then(({ data }) => { userId = data.user?.id ?? null; }).catch(() => {});
  supabase.auth.onAuthStateChange((_e, session) => { userId = session?.user?.id ?? null; });

  // JS errors
  window.addEventListener("error", (e) => {
    enqueue({
      kind: "error",
      route: currentRoute(),
      meta: {
        message: String(e.message ?? "Unknown error").slice(0, 500),
        filename: e.filename ? String(e.filename).slice(0, 200) : undefined,
        stack: (e.error as Error | undefined)?.stack?.slice(0, 1000),
      },
    });
  });

  // Unhandled rejections
  window.addEventListener("unhandledrejection", (e) => {
    const reason: any = e.reason;
    enqueue({
      kind: "rejection",
      route: currentRoute(),
      meta: {
        message: String(reason?.message ?? reason ?? "Unhandled rejection").slice(0, 500),
        stack: (reason?.stack as string | undefined)?.slice(0, 1000),
      },
    });
  });

  // SPA route changes — patch history methods + listen to popstate.
  let lastRoute = currentRoute();
  let routeChangedAt = performance.now();

  const handleRouteChange = () => {
    const next = currentRoute();
    if (next === lastRoute) return;
    const now = performance.now();
    enqueue({ kind: "route", route: next, value: Math.round(now - routeChangedAt), meta: { from: lastRoute } });
    lastRoute = next;
    routeChangedAt = now;
  };

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = function (...args: Parameters<typeof origPush>) {
    const r = origPush(...args);
    queueMicrotask(handleRouteChange);
    return r;
  };
  history.replaceState = function (...args: Parameters<typeof origReplace>) {
    const r = origReplace(...args);
    queueMicrotask(handleRouteChange);
    return r;
  };
  window.addEventListener("popstate", handleRouteChange);

  // Navigation timing snapshot — fires once.
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      enqueue({
        kind: "nav",
        route: currentRoute(),
        value: Math.round(nav.loadEventEnd - nav.startTime),
        meta: {
          dom_content_loaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          response_end: Math.round(nav.responseEnd - nav.startTime),
        },
      });
    }
  } catch { /* ignore */ }

  // Flush on hide / unload — sendBeacon path.
  const finalFlush = () => flush(true);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") finalFlush();
  });
  window.addEventListener("pagehide", finalFlush);

  // Lazy-load web-vitals AFTER first paint to avoid measurement interference.
  const startVitals = () => {
    import("web-vitals")
      .then(({ onLCP, onFCP, onCLS, onINP, onTTFB }) => {
        const report = (kind: Event["kind"]) => (m: { value: number; rating: string }) => {
          enqueue({ kind, route: currentRoute(), value: Math.round(m.value), rating: m.rating } as Event);
        };
        onLCP(report("lcp"));
        onFCP(report("fcp"));
        onCLS(report("cls"));
        onINP(report("inp"));
        onTTFB(report("ttfb"));
      })
      .catch(() => { /* never break the app for telemetry */ });
  };

  if (document.readyState === "complete") {
    setTimeout(startVitals, 0);
  } else {
    window.addEventListener("load", () => setTimeout(startVitals, 0), { once: true });
  }
}

// Test-only / explicit flush.
export function flushRumNow() {
  flush(true);
}
