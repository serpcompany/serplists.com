import { z } from "zod";
import { isRecord, type JsonRecord } from "../../../src/lib/schemas/jsonRecords";
import type { Env } from "../types";
import { requestHostIsSafe, requestOriginIsAllowed } from "../utils/agent-mcp-host";
import { describeErrorForLog, log } from "../utils/logger";
import { failedAuthIsBlocked, limitPersonalRunKey, recordFailedAuth } from "../utils/mcp-limits";
import {
  authenticatePersonalRunKey,
  markPersonalRunKeyUsed,
  type PersonalRunKeyIdentity,
} from "../utils/personal-run-key";
import { describeList, listRuns, listTemplates } from "./agentMcpLists";
import { boundedText, byteSize, fits, resultTooLarge, titleOf, toJson, type ToolResult } from "./agentMcpPages";
import { describeRunRead } from "./agentMcpRunPages";
import { getRun, startRun, updateRun } from "./agentMcpRunTools";
import { describeTemplateRead } from "./agentMcpTemplatePages";
import { createTemplate, getTemplate, updateTemplate } from "./agentMcpTemplates";
import {
  isReadOnlyTool,
  keyAllowsTool,
  ToolError,
  toolDefinitions,
  toolPermission,
} from "./agentMcpTools";

const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_SERVER_VERSION = "0.6.0";
const MAX_REQUEST_BYTES = 1024 * 1024;

type JsonRpcId = string | number | null;

interface JsonRpcRequest extends JsonRecord {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface ToolCallParams extends JsonRecord {
  name?: unknown;
  arguments?: unknown;
}

const isJsonRpcRequest: (value: unknown) => value is JsonRpcRequest = isRecord;
const isToolCallParams: (value: unknown) => value is ToolCallParams = isRecord;

const isValidRequestId = (value: unknown): value is string | number =>
  typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));

const initializeArgs = z.object({
  protocolVersion: z.string().trim().min(1),
  capabilities: z.record(z.unknown()),
  clientInfo: z.object({
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
  }).passthrough(),
}).passthrough();

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(toJson(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result });
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown, status = 200): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  }, status);
}

function toolResult(id: JsonRpcId, structuredContent: JsonRecord, text: string, isError = false): Response {
  const textContent = `${text}\n\n${toJson(structuredContent)}`;
  return rpcResult(id, {
    content: [{ type: "text", text: textContent }],
    structuredContent,
    ...(isError ? { isError: true } : {}),
  });
}

function checkResultBound(request: Request, identity: PersonalRunKeyIdentity, tool: string, data: JsonRecord): void {
  if (fits(data)) return;
  if (isReadOnlyTool(tool)) throw resultTooLarge();
  log("error", "mcp_result_too_large", {
    requestId: requestIdOf(request),
    keyId: identity.keyId,
    tool: toolNameForLog(tool),
    bytes: byteSize(data),
  });
}

function contentTypeIsJson(request: Request): boolean {
  return request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function acceptsMcpResponse(request: Request): boolean {
  const accept = request.headers.get("Accept");
  if (!accept) return false;
  const values = accept.toLowerCase().split(",").map((value) => value.trim().split(";", 1)[0]);
  return values.includes("application/json") && values.includes("text/event-stream");
}

function requestIdOf(request: Request): string | undefined {
  return request.headers.get("X-Request-Id") ?? undefined;
}

function toolNameForLog(name: string): string {
  return toolDefinitions.some((tool) => tool.name === name) ? name : "unknown";
}

async function callTool(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  name: string,
  rawArguments: unknown,
): Promise<{ data: ToolResult; text: string }> {
  if (!keyAllowsTool(identity.permissions, name)) {
    const permission = toolPermission(name);
    if (!permission) throw new ToolError(`Unknown tool: ${name}`, "tool_not_found");
    throw new ToolError(`This Run Key does not have the ${permission} permission`, "permission_denied", { permission });
  }

  switch (name) {
    case "list_templates": {
      const data = await listTemplates(env, identity, rawArguments);
      return { data, text: describeList(data, "template") };
    }
    case "get_template": {
      const data = await getTemplate(env, identity, rawArguments);
      return { data, text: describeTemplateRead(data) };
    }
    case "create_template": {
      const data: ToolResult = await createTemplate(request, env, identity, rawArguments);
      return { data, text: `Created template "${boundedText(titleOf(data.template))}".` };
    }
    case "update_template": {
      const data: ToolResult = await updateTemplate(request, env, identity, rawArguments);
      return { data, text: `Updated template "${boundedText(titleOf(data.template))}".` };
    }
    case "start_run": {
      const data: ToolResult = await startRun(request, env, identity, rawArguments);
      const omitted = data.sectionsOmitted === true ? " It is too large for one result; read it with get_run." : "";
      return { data, text: `Started run "${boundedText(titleOf(data.run))}".${omitted}` };
    }
    case "list_runs": {
      const data = await listRuns(env, identity, rawArguments);
      return { data, text: describeList(data, "run") };
    }
    case "get_run": {
      const data = await getRun(env, identity, rawArguments);
      return { data, text: describeRunRead(data) };
    }
    case "update_run": {
      const data: ToolResult = await updateRun(request, env, identity, rawArguments);
      const omitted = data.taskOmitted === true ? " The task is too large for one result; read it with get_run and taskId." : "";
      return { data, text: `Updated run "${boundedText(titleOf(data.run))}".${omitted}` };
    }
    default:
      throw new ToolError(`Unknown tool: ${name}`, "tool_not_found");
  }
}

export async function handleAgentMcp(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  if (!contentTypeIsJson(request)) {
    return rpcError(null, -32600, "Content-Type must be application/json", undefined, 415);
  }
  if (!acceptsMcpResponse(request)) {
    return rpcError(null, -32600, "Accept must include application/json and text/event-stream", undefined, 406);
  }
  if (!requestHostIsSafe(request, env)) {
    return rpcError(null, -32600, "Invalid Host", undefined, 403);
  }
  if (!requestOriginIsAllowed(request, env)) {
    return rpcError(null, -32600, "Origin is not allowed", undefined, 403);
  }

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) {
      return rpcError(null, -32600, "Invalid Content-Length", undefined, 400);
    }
    if (length > MAX_REQUEST_BYTES) {
      return rpcError(null, -32600, "Request body is too large", undefined, 413);
    }
  }

  if (failedAuthIsBlocked(request)) {
    return rpcError(null, -32000, "Too many failed authentication attempts", undefined, 429);
  }

  let identity: PersonalRunKeyIdentity | null;
  try {
    identity = await authenticatePersonalRunKey(request, env);
  } catch (error) {
    log("error", "mcp_auth_error", { requestId: requestIdOf(request), ...describeErrorForLog(error) });
    return rpcError(null, -32603, "Internal error", undefined, 500);
  }
  if (!identity) {
    recordFailedAuth(request);
    return rpcError(null, -32001, "Unauthorized", undefined, 401);
  }

  const requestId = requestIdOf(request);
  log("info", "mcp_request", { requestId, keyId: identity.keyId });
  const rateLimitResult = limitPersonalRunKey(identity);
  if (!rateLimitResult.allowed) {
    log("warn", "mcp_rate_limited", { requestId, keyId: identity.keyId });
    const response = rpcError(null, -32000, "Rate limit exceeded", undefined, 429);
    response.headers.set("Retry-After", String(rateLimitResult.retryAfter));
    return response;
  }

  let payload: unknown;
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_REQUEST_BYTES) {
      return rpcError(null, -32600, "Request body is too large", undefined, 413);
    }
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (!isJsonRpcRequest(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
    return rpcError(isJsonRpcRequest(payload) && isValidRequestId(payload.id) ? payload.id : null, -32600, "Invalid Request");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "id")) {
    if (!isValidRequestId(payload.id)) return rpcError(null, -32600, "Invalid Request");
  }

  const id: JsonRpcId = isValidRequestId(payload.id) ? payload.id : null;

  const protocolVersion = request.headers.get("MCP-Protocol-Version");
  if (payload.method !== "initialize" && protocolVersion !== MCP_PROTOCOL_VERSION) {
    if (!Object.prototype.hasOwnProperty.call(payload, "id")) return new Response(null, { status: 202 });
    return rpcError(id, -32600, "Unsupported or missing MCP-Protocol-Version", {
      supported: [MCP_PROTOCOL_VERSION],
    }, 400);
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "id")) {
    return new Response(null, { status: 202 });
  }

  if (payload.method === "initialize") {
    const initialize = initializeArgs.safeParse(payload.params);
    if (!initialize.success) {
      return rpcError(id, -32602, initialize.error.issues[0]?.message ?? "Invalid initialize parameters");
    }
    return rpcResult(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "serp-lists-personal-runs", version: MCP_SERVER_VERSION },
    });
  }

  if (payload.method === "ping") return rpcResult(id, {});

  if (payload.method === "tools/list") {
    const permissions = identity.permissions;
    return rpcResult(id, { tools: toolDefinitions.filter((tool) => keyAllowsTool(permissions, tool.name)) });
  }

  if (payload.method === "tools/call") {
    const params: ToolCallParams = isToolCallParams(payload.params) ? payload.params : {};
    if (typeof params.name !== "string") return rpcError(id, -32602, "Tool name is required");
    log("info", "mcp_tool_call", { requestId, keyId: identity.keyId, toolName: toolNameForLog(params.name) });
    try {
      const { data, text } = await callTool(request, env, identity, params.name, params.arguments);
      checkResultBound(request, identity, params.name, data);
      try {
        await markPersonalRunKeyUsed(env, identity);
      } catch (error) {
        log("warn", "mcp_key_usage_error", {
          requestId,
          keyId: identity.keyId,
          ...describeErrorForLog(error),
        });
      }
      return toolResult(id, data, text);
    } catch (error) {
      if (error instanceof ToolError) {
        if (error.code === "invalid_arguments" || error.code === "tool_not_found") {
          return rpcError(id, -32602, error.message, {
            code: error.code,
            ...(error.details ? { details: error.details } : {}),
          });
        }
        return toolResult(id, {
          error: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        }, error.message, true);
      }
      log("error", "mcp_tool_error", {
        requestId,
        tool: toolNameForLog(params.name),
        keyId: identity.keyId,
        userId: identity.userId,
        ...describeErrorForLog(error),
      });
      return rpcError(id, -32603, "Internal error");
    }
  }

  return rpcError(id, -32601, "Method not found");
}
