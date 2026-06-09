import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installCsrfHeader } from "./lib/csrf-fetch";
import { initRum } from "./lib/rum";

// Stamp every state-changing request with the X-Cybernet-App header so
// edge functions can reject calls forged from third-party origins.
installCsrfHeader();

// Real User Monitoring — captures Web Vitals, route timings, errors, and
// unhandled rejections from production traffic.
initRum();

// Auto-recover from stale chunk hashes after a new deploy.
// When the browser holds an old index.html that references hashed assets
// that no longer exist, dynamic imports throw "Importing a module script failed".
// Reload once to pick up the fresh manifest.
const reloadOnStaleChunk = (msg: string | undefined) => {
  if (!msg) return false;
  if (
    msg.includes("Importing a module script failed") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Unable to preload CSS")
  ) {
    const key = "__cybernet_chunk_reload__";
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      window.location.reload();
      return true;
    }
  }
  return false;
};
window.addEventListener("error", (e) => {
  reloadOnStaleChunk(e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason?.message ?? String(e.reason ?? "");
  reloadOnStaleChunk(msg);
});

createRoot(document.getElementById("root")!).render(<App />);
