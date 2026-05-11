import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
const BUILD_TIME = new Date().toISOString();
const BUILD_ID = BUILD_TIME.replace(/[-:T.Z]/g, "").slice(0, 12);

export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
