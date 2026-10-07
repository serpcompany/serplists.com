import { vi } from "vitest";

vi.mock("@functions/api/utils/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@functions/api/utils/rate-limit")>()),
  checkRateLimit: () => ({ allowed: true, remaining: 1, resetAt: 0 }),
}));
