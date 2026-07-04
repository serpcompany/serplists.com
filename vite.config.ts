import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
const DEFAULT_DEV_HOST = "::";
const DEFAULT_DEV_PORT = 8080;

function parsePort(value: string | undefined): number {
  if (!value) return DEFAULT_DEV_PORT;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_DEV_PORT;
}

function getManualChunk(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, "/");

  if (!normalizedId.includes("/node_modules/")) return undefined;

  if (
    normalizedId.includes("/node_modules/react") ||
    normalizedId.includes("/node_modules/react-dom") ||
    normalizedId.includes("/node_modules/react-router")
  ) {
    return "vendor-react";
  }

  if (normalizedId.includes("/node_modules/@radix-ui/")) {
    return "vendor-radix";
  }

  if (normalizedId.includes("/node_modules/@tanstack/")) {
    return "vendor-query";
  }

  if (
    normalizedId.includes("/node_modules/@codemirror/") ||
    normalizedId.includes("/node_modules/codemirror") ||
    normalizedId.includes("/node_modules/@lezer/")
  ) {
    return "vendor-codemirror";
  }

  if (normalizedId.includes("/node_modules/@uiw/")) {
    return "vendor-editor";
  }

  if (
    normalizedId.includes("/node_modules/react-markdown") ||
    normalizedId.includes("/node_modules/remark-") ||
    normalizedId.includes("/node_modules/unified") ||
    normalizedId.includes("/node_modules/micromark") ||
    normalizedId.includes("/node_modules/mdast") ||
    normalizedId.includes("/node_modules/hast") ||
    normalizedId.includes("/node_modules/unist") ||
    normalizedId.includes("/node_modules/vfile")
  ) {
    return "vendor-markdown";
  }

  if (
    normalizedId.includes("/node_modules/recharts") ||
    normalizedId.includes("/node_modules/d3-")
  ) {
    return "vendor-charts";
  }

  if (normalizedId.includes("/node_modules/date-fns")) {
    return "vendor-date";
  }

  return "vendor";
}

export default defineConfig(({ mode }) => ({
  server: {
    host: process.env.HOST ?? DEFAULT_DEV_HOST,
    port: parsePort(process.env.PORT),
    strictPort: true,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@functions": path.resolve(__dirname, "./functions"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
}));
