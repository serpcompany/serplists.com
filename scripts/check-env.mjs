import { readFileSync, existsSync } from "node:fs";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const parseEnvFile = (path) => {
  if (!existsSync(path)) return {};
  const contents = readFileSync(path, "utf8");
  const entries = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    entries[key] = value;
  }
  return entries;
};

const fileEnv = parseEnvFile(".dev.vars");
const runtimeEnv = { ...process.env, ...fileEnv };

createEnv({
  server: {
    JWT_SECRET: z.string().min(1),
    R2_PUBLIC_BASE_URL: z.string().url().optional(),
    FRONTEND_URL: z.string().url().optional(),
    CORS_ALLOWED_ORIGINS: z.string().min(1).optional(),
  },
  runtimeEnv,
  emptyStringAsUndefined: true,
});

console.log("env ok");
