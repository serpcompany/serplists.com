import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { isLoopbackHostname } from "@/lib/utils/loopbackHostname";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_API_URL: z.string().url().optional(),
    VITE_PERSONAL_RUN_MCP_ENABLED: z.enum(["true", "false"]).optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});

export const isPersonalRunMcpUiEnabled = (hostname?: string): boolean => {
  if (env.VITE_PERSONAL_RUN_MCP_ENABLED === "true") return true;
  if (env.VITE_PERSONAL_RUN_MCP_ENABLED === "false") return false;

  const currentHostname = hostname ?? (typeof window === "undefined" ? "" : window.location.hostname);
  return isLoopbackHostname(currentHostname);
};
