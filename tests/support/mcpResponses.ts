import { z } from "zod";

const jsonObject = z.record(z.unknown());

export const mcpToolResult = z.object({
  content: z.array(z.object({ type: z.literal("text"), text: z.string() }).passthrough()),
  structuredContent: jsonObject,
  isError: z.literal(true).optional(),
}).passthrough();

export const mcpToolResponse = z.object({ jsonrpc: z.literal("2.0"), result: mcpToolResult }).passthrough();

export const mcpResultResponse = z.object({ jsonrpc: z.literal("2.0"), result: jsonObject }).passthrough();

export const mcpErrorResponse = z.object({
  jsonrpc: z.literal("2.0"),
  error: z.object({ code: z.number(), message: z.string(), data: z.unknown().optional() }).passthrough(),
}).passthrough();

const mcpToolInputSchema = z.object({
  type: z.string(),
  properties: z.record(z.object({
    type: z.string().optional(),
    enum: z.array(z.unknown()).optional(),
    description: z.string().optional(),
  }).passthrough()),
  required: z.array(z.string()).optional(),
}).passthrough();

export type McpToolInputSchema = z.output<typeof mcpToolInputSchema>;

export const mcpToolList = z.object({
  jsonrpc: z.literal("2.0"),
  result: z.object({
    tools: z.array(z.object({
      name: z.string(),
      description: z.string(),
      inputSchema: mcpToolInputSchema,
      annotations: z.object({ readOnlyHint: z.boolean() }).passthrough(),
    }).passthrough()),
  }).passthrough(),
}).passthrough();

export const mcpArgumentsError = mcpErrorResponse.extend({
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.object({ code: z.string(), details: z.object({ issues: z.array(jsonObject) }).passthrough() }).passthrough(),
  }).passthrough(),
});

export const mcpRunResult = z.object({ run: z.object({ id: z.string(), revision: z.number() }).passthrough() }).passthrough();

export const mcpTemplateResult = z.object({
  template: z.object({ id: z.string(), version: z.number() }).passthrough(),
}).passthrough();

export const mcpTemplatesPage = z.object({ templates: z.array(jsonObject), nextCursor: z.string().optional() }).passthrough();

export const mcpRunsPage = z.object({ runs: z.array(jsonObject), nextCursor: z.string().optional() }).passthrough();

export const recordIn = (value: unknown) => jsonObject.parse(value);

export const recordsIn = (value: unknown) => z.array(jsonObject).parse(value);

export const optionalRecordIn = (value: unknown) => (value === undefined ? undefined : recordIn(value));

export const textIn = (value: unknown) => z.string().parse(value);
