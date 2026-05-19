/**
 * Cloudflare Worker — Cybernet Security Headers Injector
 *
 * Use this when Transform Rules aren't available (free plan limits) or when
 * you want logic beyond static header injection. Deploy on a route like
 * `yourdomain.com/*` and `www.yourdomain.com/*`.
 *
 * Behaviour:
 *  - Proxies the request to the origin unchanged.
 *  - Overwrites the four required headers (CSP, X-Frame-Options,
 *    Referrer-Policy, Permissions-Policy) plus HSTS / COOP / CORP / nosniff /
 *    DNS-prefetch, so the policy applies even if the origin omits them.
 *  - Leaves the response body and status untouched.
 *
 * Deploy:
 *   wrangler deploy deploy/cloudflare/worker-security-headers.js \
 *     --name cybernet-security-headers \
 *     --compatibility-date 2024-11-01
 *   Then bind the worker to the route in the Cloudflare dashboard:
 *     Workers & Pages → cybernet-security-headers → Triggers →
 *     Add route: yourdomain.com/*  and  www.yourdomain.com/*
 */

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'self'; script-src 'self' 'wasm-unsafe-eval'; script-src-elem 'self'; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; media-src 'self' blob: data:; worker-src 'self' blob:; manifest-src 'self'; connect-src 'self' https://ebndffutyrgybsduvijo.supabase.co wss://ebndffutyrgybsduvijo.supabase.co https://nominatim.openstreetmap.org https://api.qrserver.com https://server.arcgisonline.com https://*.tile.openstreetmap.org https://hooks.slack.com; frame-src 'self' https://view.officeapps.live.com; upgrade-insecure-requests",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  "X-DNS-Prefetch-Control": "off",
};

// Strip headers that may leak origin / server fingerprints.
const HEADERS_TO_STRIP = ["Server", "X-Powered-By", "Via"];

export default {
  async fetch(request) {
    const upstream = await fetch(request);
    const response = new Response(upstream.body, upstream);

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }
    for (const name of HEADERS_TO_STRIP) {
      response.headers.delete(name);
    }
    return response;
  },
};
