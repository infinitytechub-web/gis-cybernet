// src/lib/csrf-fetch.ts
//
// Patches `window.fetch` so every state-changing request originating from this
// SPA carries an `x-cybernet-app: cybernet-web` header. The matching
// `assertCsrfSafe` helper on the edge-function side rejects state-changing
// calls that lack this header, so a third-party page that somehow leaks a
// user's bearer token still cannot trigger writes — browsers will not attach
// custom headers to cross-origin form submissions without a CORS preflight,
// and our edge functions deny preflights from foreign origins.
//
// The Supabase JS client uses fetch() under the hood, so this single
// installation covers REST, RPC, Storage, and Functions calls.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const HEADER_NAME = "x-cybernet-app";
const HEADER_VALUE = "cybernet-web";

let installed = false;

export function installCsrfHeader(): void {
  if (installed || typeof window === "undefined" || !window.fetch) return;
  installed = true;
  const orig = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (SAFE_METHODS.has(method)) return orig(input, init);

      // Build a Headers object from whatever the caller passed.
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has(HEADER_NAME)) headers.set(HEADER_NAME, HEADER_VALUE);

      // If the caller passed a Request, we have to clone with new headers.
      if (input instanceof Request) {
        const cloned = new Request(input, { ...init, headers });
        return orig(cloned);
      }
      return orig(input, { ...init, headers });
    } catch {
      // Never break the request because of CSRF wrapping.
      return orig(input, init);
    }
  };
}
