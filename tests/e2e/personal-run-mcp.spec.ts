import { expect, test, type Locator, type Page } from '@playwright/test';
import { z } from 'zod';

import { firstOf } from '../support/elements';
import {
  mcpResultResponse,
  mcpRunResult,
  mcpRunsPage,
  mcpTemplateResult,
  mcpTemplatesPage,
  mcpToolList,
  mcpToolResponse,
} from '../support/mcpResponses';
import { apiJson, bodyNotRead } from './support/api-requests';
import { jsonRecord } from './support/api-bodies';
import { loginAsAdmin } from './support/sign-in';
import { API_BASE_URL as apiBaseUrl } from './support/stack';

const protocolVersion = '2025-06-18';
const MCP_RESULT_BYTE_LIMIT = 32 * 1024;
const ROOT_SCHEMA_COMBINATORS = ['oneOf', 'anyOf', 'allOf', 'not', '$ref'];

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

type JsonRecord = Record<string, unknown>;
type McpTool = z.output<typeof mcpToolList>['result']['tools'][number];

const runWithTasks = z.object({
  run: z.object({
    id: z.string(),
    revision: z.number(),
    sections: z.array(z.object({
      id: z.string(),
      items: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()).min(1),
    }).passthrough()).min(1),
  }).passthrough(),
}).passthrough();

async function mcpRequest(
  secret: string,
  method: string,
  params?: JsonRecord,
  id = 1,
  endpoint = `${apiBaseUrl}/mcp`,
) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(method === 'initialize' ? {} : { 'MCP-Protocol-Version': protocolVersion }),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params ? { params } : {}),
    }),
  });

  const body: unknown = await response.json();
  return { body, response };
}

const toolResultOf = (body: unknown) => mcpToolResponse.parse(body).result;

function structuredContentWithinResultLimit(body: unknown): JsonRecord {
  const { structuredContent } = toolResultOf(body);
  expect(new TextEncoder().encode(JSON.stringify(structuredContent)).byteLength).toBeLessThanOrEqual(MCP_RESULT_BYTE_LIMIT);
  return structuredContent;
}

function expectFlatObjectInputSchema(tool: McpTool) {
  const { inputSchema } = tool;
  expect(inputSchema.type).toBe('object');
  expect(typeof inputSchema.properties).toBe('object');
  for (const keyword of ROOT_SCHEMA_COMBINATORS) {
    expect(inputSchema).not.toHaveProperty(keyword);
  }
}

async function holdFirstRunKeyListUntilReleased(page: Page) {
  let releaseFirstList: () => void = () => undefined;
  const firstListReleased = new Promise<void>((resolve) => {
    releaseFirstList = resolve;
  });
  let heldFirstList = false;
  await page.route('**/api/agent-keys', async (route) => {
    if (route.request().method() !== 'GET' || heldFirstList) {
      await route.continue();
      return;
    }
    heldFirstList = true;
    const response = await route.fetch();
    await firstListReleased;
    await route.fulfill({ response });
  });
  return () => releaseFirstList();
}

async function expectCheckboxesInTabOrderAfter(page: Page, field: Locator, names: string[]) {
  await field.focus();
  for (const name of names) {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox', { name })).toBeFocused();
  }
}

async function toggleWithSpace(page: Page, checkbox: Locator) {
  await checkbox.focus();
  await page.keyboard.press('Space');
}

async function openAgentAccess(page: Page) {
  await page.goto('/dashboard/settings/');
  await expect(page.getByRole('heading', { name: 'Agent Access' })).toBeVisible();
}

async function revokeTheKeyIn(page: Page, keyRow: Locator) {
  await keyRow.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke key' }).click();
  await expect(keyRow.getByText('Revoked')).toBeVisible();
}

async function readTheNewRunKeySecret(page: Page) {
  const secretInput = page.getByLabel('New Run Key secret');
  await expect(secretInput).toBeVisible();
  return secretInput.inputValue();
}

test('@smoke personal Run Key drives a persistent run and revokes access', async ({ page }) => {
  await loginAsAdmin(page);

  await openAgentAccess(page);

  const keyName = `Playwright SOP Runner ${Date.now()}`;
  await page.getByLabel('Key name').fill(keyName);
  await page.getByRole('button', { name: 'Create Run Key' }).click();

  const secret = await readTheNewRunKeySecret(page);
  expect(secret.startsWith('slrk_')).toBe(true);
  expect(secret.length).toBeGreaterThan(40);
  await page.getByRole('button', { name: 'I have saved this key' }).click();

  const initialized = await mcpRequest(secret, 'initialize', {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'serplists-playwright', version: '1.0.0' },
  });
  expect(initialized.response.status).toBe(200);
  expect(mcpResultResponse.parse(initialized.body).result.protocolVersion).toBe(protocolVersion);

  const shownEndpoint = await page.getByLabel('SERP Lists MCP endpoint').inputValue();
  const initializedAtShownEndpoint = await mcpRequest(secret, 'initialize', {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'serplists-playwright', version: '1.0.0' },
  }, 2, shownEndpoint);
  expect(initializedAtShownEndpoint.response.status).toBe(200);

  const listed = await mcpRequest(secret, 'tools/list', undefined, 10);
  for (const tool of mcpToolList.parse(listed.body).result.tools) {
    expectFlatObjectInputSchema(tool);
  }

  const templateResult = await mcpRequest(secret, 'tools/call', {
    name: 'list_templates',
    arguments: {},
  }, 2);
  expect(templateResult.response.status).toBe(200);
  const templateContent = structuredContentWithinResultLimit(templateResult.body);
  const { templates } = mcpTemplatesPage.parse(templateContent);
  expect(templates.length).toBeGreaterThan(0);

  const template = firstOf(templates);
  const runTitle = `Playwright Personal SOP Run ${Date.now()}`;
  const started = await mcpRequest(secret, 'tools/call', {
    name: 'start_run',
    arguments: { templateId: template.id, title: runTitle },
  }, 3);
  expect(started.response.status).toBe(200);
  const startedContent = structuredContentWithinResultLimit(started.body);
  const startedRun = runWithTasks.parse(startedContent).run;
  const { sections } = startedRun;
  const firstSection = firstOf(sections);
  const firstTask = firstOf(firstSection.items);
  const runId = startedRun.id;
  const taskId = firstTask.id;
  const taskTitle = firstTask.title;
  const note = 'Verified through the local browser-to-MCP Playwright flow.';

  const noted = await mcpRequest(secret, 'tools/call', {
    name: 'update_run',
    arguments: {
      runId,
      expectedRevision: startedRun.revision,
      operation: 'set_task_notes',
      taskId,
      notes: note,
    },
  }, 4);
  expect(noted.response.status).toBe(200);
  const notedRun = mcpRunResult.parse(toolResultOf(noted.body).structuredContent).run;

  const completed = await mcpRequest(secret, 'tools/call', {
    name: 'update_run',
    arguments: {
      runId,
      expectedRevision: notedRun.revision,
      operation: 'set_task_completed',
      taskId,
      completed: true,
    },
  }, 5);
  expect(completed.response.status).toBe(200);
  const completedContent = structuredContentWithinResultLimit(completed.body);
  const completedRun = mcpRunResult.parse(completedContent).run;
  expect(completedContent).toMatchObject({ taskId, task: { id: taskId, isCompleted: true, notes: note } });

  const read = await mcpRequest(secret, 'tools/call', { name: 'get_run', arguments: { runId } }, 6);
  const readRun = runWithTasks.parse(structuredContentWithinResultLimit(read.body)).run;
  expect(readRun).toMatchObject({ id: runId, revision: completedRun.revision, progress: completedRun.progress });
  const readTask = firstOf(firstOf(readRun.sections).items);
  expect(readTask).toMatchObject({ id: taskId, isCompleted: true, notes: note });
  const oneTask = await mcpRequest(secret, 'tools/call', { name: 'get_run', arguments: { runId, taskId } }, 7);
  expect(structuredContentWithinResultLimit(oneTask.body)).toEqual({
    run: { id: runId, revision: completedRun.revision },
    sectionId: firstSection.id,
    task: readTask,
  });
  const runList = await mcpRequest(secret, 'tools/call', { name: 'list_runs', arguments: { status: 'in_progress' } }, 8);
  const [newest] = mcpRunsPage.parse(structuredContentWithinResultLimit(runList.body)).runs;
  expect(newest).toMatchObject({ id: runId, title: runTitle, revision: completedRun.revision });
  expect(newest).not.toHaveProperty('sections');

  await page.goto(`/dashboard/runs/${encodeURIComponent(runId)}/`);
  await expect(page.getByRole('heading', { name: runTitle })).toBeVisible();
  await expect(page.getByText(`${completedRun.progress}%`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: taskTitle }).click();
  await expect(page.getByLabel('Task notes')).toHaveValue(note);
  await expect(page.getByText(new RegExp(`${keyName} via MCP · authorized by `)).first()).toBeVisible();

  await page.goto('/dashboard/settings/');
  const keyRow = page.getByRole('listitem').filter({ hasText: keyName });
  await expect(keyRow).toHaveCount(1);
  await revokeTheKeyIn(page, keyRow);

  const denied = await mcpRequest(secret, 'tools/list', undefined, 9);
  expect(denied.response.status).toBe(401);
});

test('a Run Key created while the key list is still loading shows in the list', async ({ page }) => {
  await loginAsAdmin(page);

  const releaseFirstList = await holdFirstRunKeyListUntilReleased(page);

  await openAgentAccess(page);

  const keyName = `Playwright Slow List Runner ${Date.now()}`;
  await page.getByLabel('Key name').fill(keyName);
  const created = page.waitForResponse(
    (response) => response.url().endsWith('/api/agent-keys') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create Run Key' }).click();
  await created;
  releaseFirstList();

  await expect(page.getByLabel('New Run Key secret')).toBeVisible();
  const keyRow = page.getByRole('listitem').filter({ hasText: keyName });
  await expect(keyRow).toHaveCount(1);
  await expect(page.getByText('No Run Keys yet.')).toHaveCount(0);

  await revokeTheKeyIn(page, keyRow);
});

test('the permissions chosen for a Run Key decide what it can do over MCP', async ({ page }) => {
  await loginAsAdmin(page);

  await openAgentAccess(page);

  const keyName = `Playwright Template Writer ${Date.now()}`;
  const nameField = page.getByLabel('Key name');
  await nameField.fill(keyName);

  await expectCheckboxesInTabOrderAfter(page, nameField, ['Read templates', 'Write templates', 'Read runs', 'Write runs']);
  const writeTemplates = page.getByRole('checkbox', { name: 'Write templates' });
  const writeRuns = page.getByRole('checkbox', { name: 'Write runs' });
  await expect(writeTemplates).not.toBeChecked();
  await expect(writeRuns).toBeChecked();
  await toggleWithSpace(page, writeTemplates);
  await expect(writeTemplates).toBeChecked();
  await toggleWithSpace(page, writeRuns);
  await expect(writeRuns).not.toBeChecked();

  await page.getByRole('button', { name: 'Create Run Key' }).click();
  const secret = await readTheNewRunKeySecret(page);
  await page.getByRole('button', { name: 'I have saved this key' }).click();

  const keyRow = page.getByRole('listitem').filter({ hasText: keyName });
  await expect(keyRow.getByRole('list', { name: `Permissions for ${keyName}` }).getByRole('listitem'))
    .toHaveText(['Read templates', 'Write templates', 'Read runs']);

  const listed = await mcpRequest(secret, 'tools/list', undefined, 20);
  expect(mcpToolList.parse(listed.body).result.tools.map(({ name }) => name)).toEqual([
    'list_templates',
    'get_template',
    'create_template',
    'update_template',
    'list_runs',
    'get_run',
  ]);
  const denied = await mcpRequest(secret, 'tools/call', {
    name: 'start_run',
    arguments: { templateId: 'template-1' },
  }, 21);
  expect(toolResultOf(denied.body).structuredContent).toMatchObject({
    error: 'permission_denied',
    details: { permission: 'runs:write' },
  });

  const title = `Playwright agent template ${Date.now()}`;
  const created = await mcpRequest(secret, 'tools/call', {
    name: 'create_template',
    arguments: { title, sections: [{ title: 'Setup', items: [{ title: 'Install' }] }] },
  }, 22);
  const createdTemplate = mcpTemplateResult.parse(toolResultOf(created.body).structuredContent).template;
  expect(createdTemplate).toMatchObject({ title, version: 1 });
  const templateId = createdTemplate.id;
  expect(await apiJson(page, `/templates/${encodeURIComponent(templateId)}`, jsonRecord)).toMatchObject({
    title,
    is_public: false,
    owner_type: 'user',
    team_id: null,
  });

  const stale = await mcpRequest(secret, 'tools/call', {
    name: 'update_template',
    arguments: { templateId, expectedVersion: 2, title: `${title} (stale)` },
  }, 23);
  expect(toolResultOf(stale.body).structuredContent.error).toBe('edit_conflict');
  const updated = await mcpRequest(secret, 'tools/call', {
    name: 'update_template',
    arguments: { templateId, expectedVersion: 1, title: `${title} v2` },
  }, 24);
  expect(toolResultOf(updated.body).structuredContent.template).toMatchObject({
    title: `${title} v2`,
    version: 2,
  });

  const history = await apiJson(
    page,
    `/templates/${encodeURIComponent(templateId)}/history`,
    z.object({ events: z.array(z.object({ action: z.string(), metadata: jsonRecord.nullable() }).passthrough()) }).passthrough(),
  );
  expect(history.events.filter((event) => event.metadata?.personalRunKeyName === keyName).map(({ action }) => action).sort())
    .toEqual(['template.created', 'template.updated']);

  await page.goto(`/dashboard/templates/${encodeURIComponent(templateId)}/`);
  await expect(page.getByText('Updated template v2')).toBeVisible();
  await expect(page.getByText('Created template v1')).toBeVisible();
  await expect(page.getByText(new RegExp(`^${keyName} via MCP · authorized by `))).toHaveCount(2);

  await apiJson(page, `/templates/${encodeURIComponent(templateId)}`, bodyNotRead, { method: 'DELETE' });
  await page.goto('/dashboard/settings/');
  await revokeTheKeyIn(page, keyRow);
});
