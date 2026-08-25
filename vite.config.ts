import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createRequire } from "module";
import { componentTagger } from "lovable-tagger";

const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version?: string };

// https://vitejs.dev/config/
// Build identity — ITIDDMMYYYY-NN. The sequence (NN) is assigned automatically
// by the backend the first time a freshly deployed build is loaded; the
// fingerprint below is what makes each build uniquely identifiable.
const BUILD_TIME = new Date().toISOString();
const APP_VERSION = pkg.version && pkg.version !== "0.0.0" ? pkg.version : "1.0.0";
const two = (n: number) => String(n).padStart(2, "0");
const BUILT = new Date(BUILD_TIME);
const BUILD_ID = `ITI${two(BUILT.getUTCDate())}${two(BUILT.getUTCMonth() + 1)}${BUILT.getUTCFullYear()}v${APP_VERSION}`;

/** Short, stable-per-build fingerprint (build instant + version). */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
const BUILD_FINGERPRINT = `${APP_VERSION}-${shortHash(`${BUILD_TIME}|${APP_VERSION}`)}-${BUILT.getTime().toString(36)}`;

export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD_FINGERPRINT__: JSON.stringify(BUILD_FINGERPRINT),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    // Disable automatic <link rel="modulepreload"> for async chunks so the
    // Login page doesn't eagerly fetch Dashboard + its dependencies (recharts,
    // leaflet, etc.). Lazy routes will still load on demand via dynamic import.
    modulePreload: { polyfill: true, resolveDependencies: () => [] },
    // Stable vendor chunking — groups heavy libs together so they cache
    // across deploys and don't bloat individual route chunks.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "react-vendor";
          if (/[\\/]node_modules[\\/]@radix-ui[\\/]/.test(id)) return "radix";
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return "query";
          if (/[\\/]node_modules[\\/]recharts[\\/]/.test(id)) return "charts";
          if (/[\\/]node_modules[\\/](jspdf|jspdf-autotable|xlsx|docx|file-saver|qrcode)[\\/]/.test(id)) return "pdf-xlsx";
          if (/[\\/]node_modules[\\/](leaflet|leaflet\.markercluster)[\\/]/.test(id)) return "maps";
          if (/[\\/]node_modules[\\/]pdfjs-dist[\\/]/.test(id)) return "pdfjs";
          if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) return "motion";
          if (/[\\/]node_modules[\\/]date-fns[\\/]/.test(id)) return "date-fns";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
