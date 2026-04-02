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
}));
