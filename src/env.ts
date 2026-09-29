import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { isLoopbackHostname } from "@/lib/utils/loopbackHostname";

// Next.js inlines NEXT_PUBLIC_* values into the browser bundle at build time, but only where
// the code names them in full, so runtimeEnv lists each one.
export const env = createEnv({
  clientPrefix: "NEXT_PUBLIC_",
  client: {
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED: z.enum(["true", "false"]).optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED: process.env.NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED,
  },
  emptyStringAsUndefined: true,
});

export const isPersonalRunMcpUiEnabled = (hostname?: string): boolean => {
  if (env.NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED === "true") return true;
  if (env.NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED === "false") return false;

  const currentHostname = hostname ?? (typeof window === "undefined" ? "" : window.location.hostname);
  return isLoopbackHostname(currentHostname);
};
