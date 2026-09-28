import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

import { assertProductionApiUrl } from "./scripts/lib/buildEnv";

// https://vitejs.dev/config/
const DEFAULT_DEV_HOST = "::";
const DEFAULT_DEV_PORT = 8080;

function parsePort(value: string | undefined): number {
  if (!value) return DEFAULT_DEV_PORT;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_DEV_PORT;
}

export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "production") {
    // Vite inlines VITE_* values from the shell and .env files into the bundle, so a
    // deployable build must not carry a local API URL (build:dev is exempt).
    assertProductionApiUrl({
      ...loadEnv(mode, process.cwd(), "VITE_"),
      ALLOW_LOCAL_API_URL: process.env.ALLOW_LOCAL_API_URL,
    });
  }

  return {
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
  };
});
