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
