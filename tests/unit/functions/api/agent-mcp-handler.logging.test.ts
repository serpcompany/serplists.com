import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dbMocks, env, personalRun, resetAgentMcpHandlerMocks } from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { mcpToolCall } from "../../../support/agentMcp";

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("logs the key ID for every authenticated request, including malformed ones, never the secret", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ user_id: "user-2" })]);
      const toolRequest = mcpToolCall("get_run", { runId: "run-1" });
      toolRequest.headers.set("Authorization", "Bearer slrk_secret-canary");
      toolRequest.headers.set("X-Request-Id", "req-123");
      await handleAgentMcp(toolRequest, env);

      const malformed = new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          Authorization: "Bearer slrk_secret-canary",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "X-Request-Id": "req-456",
        },
        body: "{not json",
      });
      await handleAgentMcp(malformed, env);

      const entries = info.mock.calls.map(([line]) => JSON.parse(String(line)));
      expect(entries).toContainEqual(expect.objectContaining({ message: "mcp_request", requestId: "req-123", keyId: "key-1" }));
      expect(entries).toContainEqual(expect.objectContaining({
        message: "mcp_tool_call",
        requestId: "req-123",
        keyId: "key-1",
        toolName: "get_run",
      }));
      expect(entries).toContainEqual(expect.objectContaining({ message: "mcp_request", requestId: "req-456", keyId: "key-1" }));
      expect(JSON.stringify(entries)).not.toContain("secret-canary");
    } finally {
      info.mockRestore();
    }
  });

  describe("error logging", () => {
    type LogLine = Record<string, unknown>;

    const withRequestId = (request: Request, requestId = "req-123", authorization?: string) => {
      const headers = new Headers(request.headers);
      headers.set("X-Request-Id", requestId);
      if (authorization) headers.set("Authorization", authorization);
      return new Request(request, { headers });
    };

    const consoleSpies: { mockRestore: () => void }[] = [];

    const captureLogs = () => {
      const lines: { level: string; raw: string; entry: LogLine }[] = [];
      for (const level of ["error", "warn", "info"] as const) {
        consoleSpies.push(vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
          const raw = String(args[0]);
          lines.push({ level, raw, entry: JSON.parse(raw) as LogLine });
        }));
      }
      const entries = (level: string) => lines.filter((line) => line.level === level).map((line) => line.entry);
      return {
        errors: () => entries("error"),
        warnings: () => entries("warn"),
        raw: () => lines.map((line) => line.raw).join("\n"),
      };
    };

    afterEach(() => {
      for (const spy of consoleSpies.splice(0)) spy.mockRestore();
    });

    it("logs an unexpected tool failure with the request id and tool name", async () => {
      const logs = captureLogs();
      dbMocks.selectChain.limit.mockRejectedValueOnce(new Error("D1_ERROR: no such column: content_version"));

      const response = await handleAgentMcp(withRequestId(mcpToolCall("list_templates")), env);

      expect(response.status).toBe(200);
      expect((await response.json() as any).error).toEqual({ code: -32603, message: "Internal error" });
      expect(logs.errors()).toEqual([expect.objectContaining({
        message: "mcp_tool_error",
        requestId: "req-123",
        tool: "list_templates",
        keyId: "key-1",
        errorMessage: "D1_ERROR: no such column: content_version",
      })]);
    });

    it("never logs query parameters, tool arguments, or the Run Key", async () => {
      const logs = captureLogs();
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);
      const queryError = Object.assign(
        new Error('Failed query: insert into "audit_events" values (?, ?)\nparams: secret-note@example.com,Evidence'),
        { cause: new Error("D1_ERROR: string or blob too big: SQLITE_TOOBIG") },
      );
      dbMocks.db.batch.mockRejectedValueOnce(queryError);

      await handleAgentMcp(withRequestId(mcpToolCall("update_run", {
        runId: "run-1",
        expectedRevision: 2,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Evidence",
      }), "req-456", "Bearer slrk_secret_run_key"), env);

      expect(logs.errors()).toEqual([expect.objectContaining({
        message: "mcp_tool_error",
        requestId: "req-456",
        tool: "update_run",
        errorMessage: "D1_ERROR: string or blob too big: SQLITE_TOOBIG",
      })]);
      expect(logs.raw()).not.toContain("secret-note@example.com");
      expect(logs.raw()).not.toContain("Evidence");
      expect(logs.raw()).not.toContain("slrk_secret_run_key");
    });

    it("logs a failed audit and run update invariant with the run and change counts", async () => {
      const logs = captureLogs();
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);
      dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);

      await handleAgentMcp(withRequestId(mcpToolCall("update_run", {
        runId: "run-1",
        expectedRevision: 2,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Evidence",
      })), env);

      expect(logs.errors()).toEqual([expect.objectContaining({
        message: "mcp_tool_invariant",
        requestId: "req-123",
        tool: "update_run",
        runId: "run-1",
        auditChanges: 1,
        updateChanges: 0,
      })]);
    });

    it("does not log expected tool errors at error level", async () => {
      const logs = captureLogs();
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 5 })]);

      await handleAgentMcp(withRequestId(mcpToolCall("update_run", {
        runId: "run-1",
        expectedRevision: 4,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Verified locally",
      })), env);
      await handleAgentMcp(withRequestId(mcpToolCall("get_run", {})), env);
      await handleAgentMcp(withRequestId(mcpToolCall("delete_everything")), env);

      expect(logs.errors()).toEqual([]);
    });

    it("logs a Run Key authentication failure without the key", async () => {
      const logs = captureLogs();
      vi.mocked(authenticatePersonalRunKey).mockRejectedValueOnce(new Error("D1_ERROR: database is locked"));

      const response = await handleAgentMcp(
        withRequestId(mcpToolCall("list_templates"), "req-789", "Bearer slrk_secret_run_key"),
        env,
      );

      expect(response.status).toBe(500);
      expect(logs.errors()).toEqual([expect.objectContaining({
        message: "mcp_auth_error",
        requestId: "req-789",
        errorMessage: "D1_ERROR: database is locked",
      })]);
      expect(logs.raw()).not.toContain("slrk_secret_run_key");
    });

    it("logs a failed key usage update as a warning and still returns the tool result", async () => {
      const logs = captureLogs();
      vi.mocked(markPersonalRunKeyUsed).mockRejectedValueOnce(new Error("D1_ERROR: database is locked"));

      const response = await handleAgentMcp(withRequestId(mcpToolCall("list_runs")), env);

      expect((await response.json() as any).result.isError).toBeUndefined();
      expect(logs.errors()).toEqual([]);
      expect(logs.warnings()).toEqual([expect.objectContaining({
        message: "mcp_key_usage_error",
        requestId: "req-123",
        keyId: "key-1",
      })]);
    });
  });
});
