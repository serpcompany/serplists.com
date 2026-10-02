import { vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));

vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: sessionMocks.getSessionUserId }));

export { sessionMocks };
